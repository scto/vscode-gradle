package com.github.badsyntax.gradletasks;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.powermock.api.mockito.PowerMockito.*;

import io.grpc.ManagedChannel;
import io.grpc.inprocess.InProcessChannelBuilder;
import io.grpc.inprocess.InProcessServerBuilder;
import io.grpc.stub.StreamObserver;
import io.grpc.testing.GrpcCleanupRule;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.powermock.core.classloader.annotations.PrepareForTest;
import org.powermock.modules.junit4.PowerMockRunner;

@RunWith(PowerMockRunner.class)
@PrepareForTest(org.gradle.tooling.GradleConnector.class)
@SuppressWarnings(value = "unchecked")
public class GradleTasksServerTest {
  @Rule public final GrpcCleanupRule grpcCleanup = new GrpcCleanupRule();

  private GradleTasksServer server;
  private ManagedChannel inProcessChannel;
  private File mockProjectDir;
  private File mockGradleUserHome;
  private File mockJavaHome;
  private List<String> mockJvmArgs;

  @Before
  public void setUp() throws Exception {
    String serverName = InProcessServerBuilder.generateName();
    server = new GradleTasksServer(InProcessServerBuilder.forName(serverName).directExecutor(), 0);
    server.start();
    inProcessChannel =
        grpcCleanup.register(InProcessChannelBuilder.forName(serverName).directExecutor().build());
    mockProjectDir =
        new File(Files.createTempDirectory("mockProjectDir").toAbsolutePath().toString());
    mockGradleUserHome =
        new File(Files.createTempDirectory("mockGradleUserHome").toAbsolutePath().toString());
    mockJavaHome = new File("/path/to/jdk");
    mockJvmArgs = new ArrayList<>();
    setupMocks();
  }

  @Mock
  org.gradle.tooling.ModelBuilder<org.gradle.tooling.model.GradleProject> mockGradleProjectBuilder;

  @Mock org.gradle.tooling.model.GradleProject mockGradleProject;
  @Mock org.gradle.tooling.GradleConnector mockConnector;
  @Mock org.gradle.tooling.ProjectConnection mockConnection;
  @Mock org.gradle.tooling.CancellationTokenSource mockCancellationTokenSource;
  @Mock org.gradle.tooling.CancellationToken mockCancellationToken;
  @Mock org.gradle.tooling.model.build.BuildEnvironment mockEnvironment;
  @Mock org.gradle.tooling.model.build.GradleEnvironment mockGradleEnvironment;
  @Mock org.gradle.tooling.model.build.JavaEnvironment mockJavaEnvironment;

  @Mock
  org.gradle.tooling.ModelBuilder<org.gradle.tooling.model.build.BuildEnvironment>
      mockBuildEnvironmentBuilder;

  @Mock
  org.gradle.tooling.model.DomainObjectSet<? extends org.gradle.tooling.model.GradleProject>
      mockChildProjects;

  @Mock
  org.gradle.tooling.model.DomainObjectSet<? extends org.gradle.tooling.model.GradleTask> mockTasks;

  private void setupMocks() {
    mockStatic(org.gradle.tooling.GradleConnector.class);
    when(org.gradle.tooling.GradleConnector.newConnector()).thenReturn(mockConnector);
    when(org.gradle.tooling.GradleConnector.newCancellationTokenSource())
        .thenReturn(mockCancellationTokenSource);
    when(mockCancellationTokenSource.token()).thenReturn(mockCancellationToken);
    when(mockConnector.forProjectDirectory(mockProjectDir)).thenReturn(mockConnector);
    when(mockConnector.connect()).thenReturn(mockConnection);
    when(mockGradleEnvironment.getGradleUserHome()).thenReturn(mockGradleUserHome);
    when(mockGradleEnvironment.getGradleVersion()).thenReturn("6.3");
    when(mockJavaEnvironment.getJavaHome()).thenReturn(mockJavaHome);
    when(mockJavaEnvironment.getJvmArguments()).thenReturn(mockJvmArgs);
    when(mockEnvironment.getGradle()).thenReturn(mockGradleEnvironment);
    when(mockEnvironment.getJava()).thenReturn(mockJavaEnvironment);
    when(mockBuildEnvironmentBuilder.get()).thenReturn(mockEnvironment);
    doReturn(mockChildProjects).when(mockGradleProject).getChildren();
    doReturn(mockTasks).when(mockGradleProject).getTasks();
    when(mockGradleProjectBuilder.get()).thenReturn(mockGradleProject);
    when(mockGradleProjectBuilder.withCancellationToken(any()))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.addProgressListener(
            any(org.gradle.tooling.ProgressListener.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.setStandardOutput(any(OutputStream.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.setStandardError(any(OutputStream.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockGradleProjectBuilder.setColorOutput(any(Boolean.class)))
        .thenReturn(mockGradleProjectBuilder);
    when(mockConnection.model(org.gradle.tooling.model.GradleProject.class))
        .thenReturn(mockGradleProjectBuilder);
    when(mockConnection.model(org.gradle.tooling.model.build.BuildEnvironment.class))
        .thenReturn(mockBuildEnvironmentBuilder);
  }

  @After
  public void tearDown() throws Exception {
    server.stop();
    mockProjectDir.delete();
    mockGradleUserHome.delete();
  }

  @Test
  public void getBuild_shouldSetProjectDirectory() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(true))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);
    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).forProjectDirectory(mockProjectDir);
  }

  @Test
  public void getBuild_shouldUseGradleUserHome() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(
                GradleConfig.newBuilder()
                    .setUserHome(mockGradleUserHome.getAbsolutePath().toString())
                    .setWrapperEnabled(true))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).useGradleUserHomeDir(mockGradleUserHome);
  }

  @Test
  public void getBuild_shouldThrowIfWrapperNotEnabledAndNoVersionSpecified() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);
    ArgumentCaptor<Throwable> onError = ArgumentCaptor.forClass(Throwable.class);
    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver).onError(onError.capture());
    assertEquals("INTERNAL: Gradle version is required", onError.getValue().getMessage());
  }

  @Test
  public void getBuild_shouldSetGradleVersionWrapperNotEnabledVersionSpecified() throws Exception {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);
    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(GradleConfig.newBuilder().setWrapperEnabled(false).setVersion("6.3"))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

    stub.getBuild(req, mockResponseObserver);
    mockResponseObserver.onCompleted();
    verify(mockResponseObserver, never()).onError(any());
    verify(mockConnector).useGradleVersion("6.3");
  }

  @Test
  public void getBuild_shouldUseJvmArgs() throws IOException {
    GradleTasksGrpc.GradleTasksStub stub = GradleTasksGrpc.newStub(inProcessChannel);

    String jvmArgs = "-Xmx64m -Xms64m";

    GetBuildRequest req =
        GetBuildRequest.newBuilder()
            .setProjectDir(mockProjectDir.getAbsolutePath().toString())
            .setGradleConfig(
                GradleConfig.newBuilder().setJvmArguments(jvmArgs).setWrapperEnabled(true))
            .build();
    StreamObserver<GetBuildReply> mockResponseObserver =
        (StreamObserver<GetBuildReply>) mock(StreamObserver.class);

    stub.getBuild(req, mockResponseObserver);
    verify(mockResponseObserver, never()).onError(any());
    verify(mockGradleProjectBuilder).setJvmArguments(jvmArgs);
  }
}
