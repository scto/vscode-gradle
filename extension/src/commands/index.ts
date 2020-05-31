import * as vscode from 'vscode';

import { GradleTaskTreeItem, GradleDaemonTreeItem } from '../views';
import {
  runTask,
  getTaskExecution,
  queueRestartTask,
  runTaskWithArgs,
  cancelTask,
} from '../tasks/taskUtil';
import { logger } from '../logger';
import { invalidateTasksCache, GradleTaskDefinition } from '../tasks';
import { Extension } from '../extension';
import { getIgnoreDaemonStopWarning } from '../config';
import { StopDaemonsReply } from '../proto/gradle_pb';
import {
  isJavaLanguageSupportExtensionActivated,
  JAVA_CONFIGURATION_UPDATE_COMMAND,
} from '../compat';
import { getTaskArgs } from '../input';
import {
  COMMAND_SHOW_TASKS,
  COMMAND_RUN_TASK,
  COMMAND_DEBUG_TASK,
  COMMAND_RESTART_TASK,
  COMMAND_RUN_TASK_WITH_ARGS,
  COMMAND_DEBUG_TASK_WITH_ARGS,
  COMMAND_RENDER_TASK,
  COMMAND_CANCEL_TASK,
  COMMAND_CANCEL_TREE_ITEM_TASK,
  COMMAND_REFRESH,
  COMMAND_LOAD_TASKS,
  COMMAND_REFRESH_DAEMON_STATUS,
  COMMAND_STOP_DAEMONS,
  COMMAND_STOP_DAEMON,
  COMMAND_EXPLORER_TREE,
  COMMAND_EXPLORER_FLAT,
  COMMAND_OPEN_SETTINGS,
  COMMAND_OPEN_BUILD_FILE,
  COMMAND_CANCELLING_TREE_ITEM_TASK,
  COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
  COMMAND_SHOW_LOGS,
  COMMAND_BOOKMARK_TASK,
  COMMAND_REMOVE_BOOKMARKED_TASK,
  COMMAND_OPEN_BOOKMARK_HELP,
  COMMAND_BOOKMARK_TASK_WITH_ARGS,
  COMMAND_SHOW_TASK_TERMINAL,
  COMMAND_CLOSE_TASK_TERMINALS,
  COMMAND_CLOSE_ALL_TASK_TERMINALS,
  COMMAND_CLEAR_ALL_RECENT_TASKS,
  COMMAND_REMOVE_RECENT_TASK,
  COMMAND_CLEAR_ALL_BOOKMARKED_TASKS,
} from './constants';
import {
  focusProjectInGradleTasksTree,
  updateGradleTreeItemStateForTask,
} from '../views/viewUtil';

const EXTENSION_NAME = 'richardwillis.vscode-gradle';

function registerShowTasksCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_SHOW_TASKS,
    async (uri: vscode.Uri) => {
      focusProjectInGradleTasksTree(uri);
    }
  );
}

function registerRunTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RUN_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task);
      }
    }
  );
}

function registerDebugTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_DEBUG_TASK,
    async (treeItem: GradleTaskTreeItem, args = '') => {
      if (treeItem && treeItem.task) {
        runTask(treeItem.task, args, true);
      }
    }
  );
}

function registerRestartTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RESTART_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const taskExecution = getTaskExecution(treeItem.task);
        if (taskExecution) {
          queueRestartTask(taskExecution.task);
        }
      }
    }
  );
}

function registerRunTaskWithArgsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RUN_TASK_WITH_ARGS,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTaskWithArgs(treeItem.task, false);
      } else {
        logger.error(
          'Unable to run task with args. TreeItem or TreeItem task not found.'
        );
      }
    }
  );
}

function registerDebugTaskWithArgsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_DEBUG_TASK_WITH_ARGS,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        runTaskWithArgs(treeItem.task, true);
      } else {
        logger.error(
          'Unable to debug task with args. TreeItem or TreeItem task not found.'
        );
      }
    }
  );
}

function registerRenderTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_RENDER_TASK,
    (task: vscode.Task) => {
      updateGradleTreeItemStateForTask(task);
    }
  );
}

function registerCancelTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCEL_TASK,
    async (task: vscode.Task) => {
      try {
        await cancelTask(task);
      } catch (e) {
        logger.error('Error cancelling task:', e.message);
      }
    }
  );
}

function registerCancelTreeItemTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCEL_TREE_ITEM_TASK,
    (treeItem) => {
      if (treeItem && treeItem.task) {
        vscode.commands.executeCommand(COMMAND_CANCEL_TASK, treeItem.task);
      }
    }
  );
}

function registerRefreshCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REFRESH,
    async (): Promise<void> => {
      invalidateTasksCache();
      await Extension.getInstance().getGradleTaskProvider().loadTasks();
      Extension.getInstance().getGradleTasksTreeDataProvider().refresh();
    }
  );
}

function registerLoadTasksCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_LOAD_TASKS, () => {
    return Extension.getInstance().getGradleTaskProvider().loadTasks();
  });
}

function registerRefreshDaemonStatusCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REFRESH_DAEMON_STATUS,
    (): void => {
      Extension.getInstance().getGradleDaemonsTreeDataProvider().refresh();
    }
  );
}

async function cancelStopDaemons(): Promise<boolean | undefined> {
  const ignoreWarning = getIgnoreDaemonStopWarning();
  if (!ignoreWarning) {
    const DAEMON_STOP_OPTION_CONFIRM = 'Yes';
    const result = await vscode.window.showWarningMessage(
      'Are you sure you want to stop the daemon/s?',
      { modal: true },
      DAEMON_STOP_OPTION_CONFIRM
    );
    if (result !== DAEMON_STOP_OPTION_CONFIRM) {
      return true;
    }
  }
}

function registerStopDaemons(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_STOP_DAEMONS,
    async (): Promise<void> => {
      if (!vscode.workspace.workspaceFolders || (await cancelStopDaemons())) {
        return;
      }
      try {
        const promises: Promise<StopDaemonsReply | void>[] = vscode.workspace.workspaceFolders.map(
          (folder) =>
            Extension.getInstance().getClient().stopDaemons(folder.uri.fsPath)
        );
        const replies = await Promise.all(promises);
        replies.forEach((reply) => {
          if (reply) {
            logger.info(reply.getMessage());
          }
        });
      } finally {
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    }
  );
}

function registerStopDaemon(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_STOP_DAEMON,
    async (treeItem: GradleDaemonTreeItem): Promise<void> => {
      if (await cancelStopDaemons()) {
        return;
      }
      const pid = treeItem.pid;
      try {
        const stopDaemonReply = await Extension.getInstance()
          .getClient()
          .stopDaemon(pid);
        if (stopDaemonReply) {
          logger.info(stopDaemonReply.getMessage());
        }
      } finally {
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    }
  );
}

function registerExplorerTreeCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_EXPLORER_TREE, () => {
    Extension.getInstance()
      .getGradleTasksTreeDataProvider()
      .setCollapsed(false);
  });
}

function registerExplorerFlatCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_EXPLORER_FLAT, () => {
    Extension.getInstance().getGradleTasksTreeDataProvider().setCollapsed(true);
  });
}

function registerOpenSettingsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, (): void => {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      `@ext:${EXTENSION_NAME}`
    );
  });
}

function registerOpenBuildFileCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_OPEN_BUILD_FILE,
    (taskItem: GradleTaskTreeItem): void => {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(taskItem.task.definition.buildFile)
      );
    }
  );
}

function registerCancellingTreeItemTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CANCELLING_TREE_ITEM_TASK,
    () => {
      vscode.window.showInformationMessage(
        'Gradle task is cancelling, please wait'
      );
    }
  );
}

function registerUpdateJavaProjectConfigurationCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
    async (buildFile: vscode.Uri) => {
      if (isJavaLanguageSupportExtensionActivated()) {
        try {
          await vscode.commands.executeCommand(
            JAVA_CONFIGURATION_UPDATE_COMMAND,
            buildFile
          );
        } catch (err) {
          logger.error(
            'Unable to update Java project configuration:',
            err.message
          );
        }
      }
    }
  );
}

function registerShowLogsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_SHOW_LOGS, () => {
    logger.getChannel()?.show();
  });
}

function registerBookmarkTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_BOOKMARK_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        Extension.getInstance()
          .getBookmarkedTasksTreeDataProvider()
          .getStore()
          .addEntry(definition.id, definition.args);
      }
    }
  );
}

function registerBookmarkTaskWithArgsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_BOOKMARK_TASK_WITH_ARGS,
    async (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const args = await getTaskArgs();
        if (args) {
          const definition = treeItem.task.definition as GradleTaskDefinition;
          Extension.getInstance()
            .getBookmarkedTasksTreeDataProvider()
            .getStore()
            .addEntry(definition.id, args);
        }
      }
    }
  );
}

function registerRemoveBookmarkedTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REMOVE_BOOKMARKED_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        Extension.getInstance()
          .getBookmarkedTasksTreeDataProvider()
          .getStore()
          .removeEntry(definition.id, definition.args);
      }
    }
  );
}

function registerOpenBookmarkHelpCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_OPEN_BOOKMARK_HELP, () => {
    vscode.window.showInformationMessage(
      'Bookmark your favourite tasks via the task context menu.'
    );
  });
}

function registerShowTaskTerminalCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_SHOW_TASK_TERMINAL,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        const terminalsSet = Extension.getInstance()
          .getTaskTerminalsStore()
          .getItem(definition.id + definition.args);
        if (terminalsSet) {
          const terminals = Array.from(terminalsSet);
          const mostRecentTerminal = terminals.pop();
          if (mostRecentTerminal) {
            mostRecentTerminal.show();
          }
        }
      }
    }
  );
}

function registerCloseTaskTerminalsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CLOSE_TASK_TERMINALS,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        const taskTerminalsStore = Extension.getInstance().getTaskTerminalsStore();
        const terminalsSet = taskTerminalsStore.getItem(
          definition.id + definition.args
        );
        if (terminalsSet) {
          Array.from(terminalsSet).forEach((terminal) => {
            terminal.dispose();
          });
        }
      }
    }
  );
}

function registerCloseAllTaskTerminalsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CLOSE_ALL_TASK_TERMINALS,
    () => {
      const taskTerminalsStore = Extension.getInstance().getTaskTerminalsStore();
      Array.from(taskTerminalsStore.getData().keys()).forEach((key) => {
        const terminalsSet = taskTerminalsStore.getItem(key);
        if (terminalsSet) {
          Array.from(terminalsSet).forEach((terminal) => terminal.dispose());
        }
      });
      taskTerminalsStore.clear();
    }
  );
}

function registerClearAllRecentTasksCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(COMMAND_CLEAR_ALL_RECENT_TASKS, () => {
    Extension.getInstance().getRecentTasksStore().clear();
  });
}

function registerClearAllBookmarkedTasksCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_CLEAR_ALL_BOOKMARKED_TASKS,
    () => {
      Extension.getInstance().getBookmarkedTasksStore().clear();
    }
  );
}

function registerRemoveRecentTaskCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    COMMAND_REMOVE_RECENT_TASK,
    (treeItem: GradleTaskTreeItem) => {
      if (treeItem && treeItem.task) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        Extension.getInstance()
          .getRecentTasksStore()
          .removeItem(definition.id + definition.args);
      }
    }
  );
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerShowTasksCommand(),
    registerRunTaskCommand(),
    registerDebugTaskCommand(),
    registerRestartTaskCommand(),
    registerRunTaskWithArgsCommand(),
    registerDebugTaskWithArgsCommand(),
    registerCancelTaskCommand(),
    registerCancelTreeItemTaskCommand(),
    registerRefreshCommand(),
    registerRefreshDaemonStatusCommand(),
    registerStopDaemons(),
    registerStopDaemon(),
    registerExplorerTreeCommand(),
    registerExplorerFlatCommand(),
    registerOpenSettingsCommand(),
    registerOpenBuildFileCommand(),
    registerCancellingTreeItemTaskCommand(),
    registerRenderTaskCommand(),
    registerUpdateJavaProjectConfigurationCommand(),
    registerShowLogsCommand(),
    registerLoadTasksCommand(),
    registerBookmarkTaskCommand(),
    registerBookmarkTaskWithArgsCommand(),
    registerRemoveBookmarkedTaskCommand(),
    registerOpenBookmarkHelpCommand(),
    registerShowTaskTerminalCommand(),
    registerCloseTaskTerminalsCommand(),
    registerCloseAllTaskTerminalsCommand(),
    registerClearAllRecentTasksCommand(),
    registerClearAllBookmarkedTasksCommand(),
    registerRemoveRecentTaskCommand()
  );
}
