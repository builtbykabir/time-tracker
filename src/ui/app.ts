import {
  ASCIIFontRenderable,
  BoxRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  createCliRenderer,
} from '@opentui/core';

import type { KeyEvent } from '@opentui/core';

import type { AppSettings, ThemeCatalog } from '../config/settings.ts';
import type { CategoryService } from '../services/category-service.ts';
import type { DeadlineService } from '../services/deadline-service.ts';
import type { SessionService } from '../services/session-service.ts';
import type { StatisticsService } from '../services/statistics-service.ts';
import type { TodoService } from '../services/todo-service.ts';
import { CategoriesController } from './controllers/categories-controller.ts';
import { DashboardController } from './controllers/dashboard-controller.ts';
import { DeadlinesController } from './controllers/deadlines-controller.ts';
import { SessionsController } from './controllers/sessions-controller.ts';
import { SettingsController } from './controllers/settings-controller.ts';
import { StatisticsController } from './controllers/statistics-controller.ts';
import { TodosController } from './controllers/todos-controller.ts';
import { configureChartPalette } from './theme/chart-palette.ts';
import { createCategoriesView } from './views/categories.ts';
import { createDashboard } from './views/dashboard.ts';
import { createDeadlinesView } from './views/deadlines.ts';
import { createSessionsView } from './views/sessions.ts';
import { createSettingsView } from './views/settings.ts';
import { createStatisticsView } from './views/statistics.ts';
import { createTodosView } from './views/todos.ts';

export interface UiServices {
  sessionService: SessionService;
  categoryService: CategoryService;
  deadlineService: DeadlineService;
  todoService: TodoService;
  statisticsService: StatisticsService;
}

interface ManagedView {
  root: BoxRenderable;
  activate?(): void;
  deactivate?(): void;
  handleKey?(key: KeyEvent): boolean;
  isEditing?(): boolean;
}

export async function startUi(
  settings: AppSettings,
  services: UiServices,
  themes: ThemeCatalog,
): Promise<void> {
  let currentSettings = cloneSettings(settings);
  configureChartPalette(currentSettings.theme.graphColors);
  const { backgroundColor, surfaceColor, accentColor, mutedColor } = currentSettings.theme;

  let dateTimeFormatter = new Intl.DateTimeFormat(currentSettings.locale, {
    timeZone: currentSettings.timeZone,
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  let timeFormatter = new Intl.DateTimeFormat(currentSettings.locale, {
    timeZone: currentSettings.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  let useCompactClock = false;

  const formatCurrentDateTime = (): string =>
    (useCompactClock ? timeFormatter : dateTimeFormatter).format(new Date()).toUpperCase();

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor,
  });

  // ==========================================
  // CONTAINER 1: Header (Rounded, Orange border)
  // ==========================================
  const header = new BoxRenderable(renderer, {
    width: '100%',
    height: 4,
    flexShrink: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const headerLeft = new BoxRenderable(renderer, {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surfaceColor,
  });

  const title = new ASCIIFontRenderable(renderer, {
    text: currentSettings.title.toUpperCase(),
    font: 'tiny',
    color: accentColor,
    backgroundColor: surfaceColor,
    selectable: false,
  });

  const tagDivider = new TextRenderable(renderer, {
    content: ' │ \n │ ',
    fg: mutedColor,
    selectable: false,
  });

  const taglineBox = new BoxRenderable(renderer, {
    flexDirection: 'column',
    justifyContent: 'center',
    backgroundColor: surfaceColor,
  });

  const tagline1 = new TextRenderable(renderer, {
    content: currentSettings.headerLine1,
    fg: mutedColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });
  const tagline2 = new TextRenderable(renderer, {
    content: currentSettings.headerLine2,
    fg: mutedColor,
    attributes: TextAttributes.DIM,
    selectable: false,
  });

  taglineBox.add(tagline1);
  taglineBox.add(tagline2);

  headerLeft.add(title);
  headerLeft.add(tagDivider);
  headerLeft.add(taglineBox);

  const clock = new TextRenderable(renderer, {
    content: formatCurrentDateTime(),
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  header.add(headerLeft);
  header.add(clock);

  // ==========================================
  // CONTAINER 2: Main Workspace (Rounded, Orange border)
  // ==========================================
  const body = new BoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor,
    flexDirection: 'row',
  });

  const sidebar = new BoxRenderable(renderer, {
    width: 24,
    height: '100%',
    flexShrink: 0,
    border: false,
    backgroundColor,
    padding: 1,
  });

  const navigationItems = [
    { icon: '⊞', label: 'DASHBOARD' },
    { icon: '◷', label: 'SESSIONS' },
    { icon: '▲', label: 'STATISTICS' },
    { icon: '◫', label: 'CATEGORIES' },
    { icon: '■', label: 'TASKS' },
    { icon: '◈', label: 'SETTINGS' },
  ];
  navigationItems.splice(5, 0, { icon: '◆', label: 'DEADLINES' });
  const navigationLabels: TextRenderable[] = [];
  const navigationTabs: BoxRenderable[] = [];

  const navigationScroll = new ScrollBoxRenderable(renderer, {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    scrollY: true,
    scrollX: false,
    rootOptions: { backgroundColor },
    viewportOptions: { backgroundColor },
    contentOptions: {
      backgroundColor,
      flexDirection: 'column',
      paddingRight: 1,
    },
    verticalScrollbarOptions: {
      trackOptions: { foregroundColor: accentColor, backgroundColor },
    },
  });

  const navigationList = new BoxRenderable(renderer, {
    width: '100%',
    flexShrink: 0,
    backgroundColor,
    flexDirection: 'column',
  });

  for (const [index, item] of navigationItems.entries()) {
    const isSelected = index === 0;
    const tab = new BoxRenderable(renderer, {
      width: '100%',
      height: 3,
      flexShrink: 0,
      border: true,
      borderStyle: 'rounded',
      borderColor: isSelected ? accentColor : surfaceColor,
      backgroundColor: isSelected ? accentColor : backgroundColor,
      paddingLeft: 2,
      justifyContent: 'center',
    });
    const navigationLabel = new TextRenderable(renderer, {
      content: `[${index + 1}] ${item.icon} ${item.label}`,
      fg: isSelected ? backgroundColor : accentColor,
      attributes: TextAttributes.BOLD,
      selectable: false,
    });

    navigationLabels.push(navigationLabel);
    navigationTabs.push(tab);
    tab.add(navigationLabel);
    navigationList.add(tab);
  }

  navigationScroll.add(navigationList);
  sidebar.add(navigationScroll);

  const sidebarDivider = new TextRenderable(renderer, {
    content: '│\n'.repeat(50),
    fg: accentColor,
    selectable: false,
  });

  let dashboardView = createDashboard(renderer, currentSettings);
  let sessionsView = createSessionsView(renderer, currentSettings.theme);
  let sessionsController = new SessionsController(
    sessionsView,
    services.sessionService,
    services.categoryService,
    currentSettings,
  );
  let statisticsView = createStatisticsView(renderer, currentSettings);
  let statisticsController = new StatisticsController(
    statisticsView,
    services.statisticsService,
    currentSettings,
  );
  let dashboardController = new DashboardController(
    dashboardView,
    services.sessionService,
    services.categoryService,
    services.statisticsService,
    services.todoService,
    currentSettings,
    () => {
      sessionsController.refresh();
      statisticsController.refresh();
    },
    services.deadlineService,
  );
  let categoriesView = createCategoriesView(renderer, currentSettings.theme);
  let categoriesController = new CategoriesController(
    categoriesView,
    services.categoryService,
    services.statisticsService,
    currentSettings,
  );
  let todosView = createTodosView(renderer, currentSettings.theme);
  let todosController = new TodosController(
    todosView,
    services.todoService,
    services.categoryService,
    currentSettings,
  );
  let deadlinesView = createDeadlinesView(renderer, currentSettings.theme);
  let deadlinesController = new DeadlinesController(
    deadlinesView,
    services.deadlineService,
    currentSettings,
  );
  let settingsView = createSettingsView(renderer, currentSettings.theme);
  let reloadUi: (nextSettings: AppSettings, statusMessage?: string) => void;
  let settingsController = new SettingsController(settingsView, currentSettings, themes, {
    onSaved(nextSettings, statusMessage) {
      reloadUi(nextSettings, statusMessage);
    },
  });

  let dashboardInitialized = false;
  const views: ManagedView[] = [
    {
      root: dashboardView.root,
      activate: () => {
        dashboardView.scrollBox.focus();
        if (dashboardInitialized) dashboardController.initialize();
      },
      deactivate: () => dashboardView.scrollBox.blur(),
      handleKey: (key) => dashboardController.handleKey(key),
    },
    sessionsView,
    statisticsView,
    categoriesView,
    todosView,
    deadlinesView,
    settingsView,
  ];
  let activeView: ManagedView = views[0]!;
  let activeNavigationIndex = 0;

  // ==========================================
  // CONTAINER 3: Footer (Rounded, Orange border)
  // ==========================================
  const footer = new BoxRenderable(renderer, {
    width: '100%',
    height: 3,
    flexShrink: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: accentColor,
    backgroundColor: surfaceColor,
    paddingX: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const footerText = new TextRenderable(renderer, {
    content: '',
    fg: accentColor,
    attributes: TextAttributes.BOLD,
    selectable: false,
  });

  footer.add(footerText);

  const footerActions = [
    '[S] START/STOP  [C] CATEGORY',
    '[UP/DOWN] SELECT  [D] DELETE  [R] REFRESH',
    '[D/W/M] RANGE  [X] CUSTOM  [LEFT/RIGHT] PERIOD  [R] REFRESH',
    '[N] NEW  [A] ARCHIVE  [UP/DOWN] SELECT  [R] REFRESH',
    '[N] NEW  [SPACE] TOGGLE  [D] DELETE  [F] FILTER',
    '[N] NEW  [SPACE] COMPLETE  [D] DELETE  [F] FILTER',
    '[UP/DOWN] SELECT  [ENTER] EDIT  [LEFT/RIGHT] CYCLE',
  ];
  const compactFooterActions = [
    '[S] START/STOP  [C] CATEGORY',
    '[UP/DN] SELECT  [D] DELETE  [R] REFRESH',
    '[D/W/M] RANGE  [X] CUSTOM  [R] REFRESH',
    '[N] NEW  [A] ARCHIVE  [UP/DN] SELECT  [R] REFRESH',
    '[N] NEW  [SPACE] TOGGLE  [D] DELETE  [F] FILTER',
    '[N] NEW  [SPACE] DONE  [D] DELETE  [F] FILTER',
    '[UP/DN] SELECT  [ENTER] EDIT  [LEFT/RIGHT] CYCLE',
  ];
  let terminalWidth = renderer.width;
  const renderFooter = (): void => {
    const actions = footerActions[activeNavigationIndex] ?? '';
    const compactActions = compactFooterActions[activeNavigationIndex] ?? '';
    const common = '[1-7] NAV  [Q] QUIT';
    if (terminalWidth < 105) {
      footerText.content = `${compactActions}  ${common}`;
    } else {
      footerText.content = `${actions}  ${common}`;
    }
  };

  body.add(sidebar);
  body.add(sidebarDivider);
  body.add(activeView.root);

  renderer.root.add(header);
  renderer.root.add(body);
  renderer.root.add(footer);
  activeView.activate?.();

  const clockInterval = setInterval(() => {
    clock.content = formatCurrentDateTime();
  }, 1_000);

  const showView = (navigationIndex: number, nextView: ManagedView): void => {
    if (nextView === activeView) {
      return;
    }

    activeView.deactivate?.();
    body.remove(activeView.root);
    activeView = nextView;
    body.add(activeView.root);
    activeView.activate?.();

    const previousLabel = navigationLabels[activeNavigationIndex];
    const nextLabel = navigationLabels[navigationIndex];
    const previousTab = navigationTabs[activeNavigationIndex];
    const nextTab = navigationTabs[navigationIndex];

    const currentTheme = currentSettings.theme;
    if (previousLabel && previousTab) {
      previousLabel.attributes = TextAttributes.BOLD;
      previousLabel.fg = currentTheme.accentColor;
      previousTab.backgroundColor = currentTheme.backgroundColor;
      previousTab.borderColor = currentTheme.surfaceColor;
    }

    if (nextLabel && nextTab) {
      nextLabel.attributes = TextAttributes.BOLD;
      nextLabel.fg = currentTheme.backgroundColor;
      nextTab.backgroundColor = currentTheme.accentColor;
      nextTab.borderColor = currentTheme.accentColor;
    }

    activeNavigationIndex = navigationIndex;
    if (nextTab) {
      navigationScroll.scrollChildIntoView(nextTab, { align: 'nearest', inset: 1 });
    }
    renderFooter();
  };

  const onKeyPress = (key: KeyEvent): void => {
    if (activeView.isEditing?.()) {
      if (activeView.handleKey?.(key)) {
        key.stopPropagation();
      }
      return;
    }

    const navigationIndex = Number(key.name) - 1;
    const nextView = views[navigationIndex];

    if (nextView) {
      showView(navigationIndex, nextView);
      key.stopPropagation();
      return;
    }

    if (key.name === 'q') {
      renderer.destroy();
      key.stopPropagation();
      return;
    }

    if (activeView.handleKey?.(key)) {
      key.stopPropagation();
    }
  };

  renderer.keyInput.on('keypress', onKeyPress);

  const updateResponsiveLayout = (width: number, height: number): void => {
    const showSidebar = width >= 105;
    sidebar.visible = showSidebar;
    sidebarDivider.visible = showSidebar;
    sidebarDivider.content = '│\n'.repeat(Math.max(10, height));
    sidebar.width = 24;
    taglineBox.visible = width >= 115;
    tagDivider.visible = width >= 115;
    useCompactClock = width < 150;
    clock.content = formatCurrentDateTime();
    terminalWidth = width;
    renderFooter();
    const activeTab = navigationTabs[activeNavigationIndex];
    if (showSidebar && activeTab) {
      navigationScroll.afterLayout(() => {
        navigationScroll.scrollChildIntoView(activeTab, { align: 'nearest', inset: 1 });
      });
    }
    dashboardView.updateLayout(width, height);
    sessionsView.updateLayout(width, height);
    statisticsView.updateLayout(width);
    categoriesView.updateLayout(width, height);
    todosView.updateLayout(width, height);
    deadlinesView.updateLayout(width, height);
    settingsView.updateLayout(width, height);
  };

  updateResponsiveLayout(renderer.width, renderer.height);
  renderer.on('resize', updateResponsiveLayout);

  reloadUi = (nextSettings: AppSettings, statusMessage?: string): void => {
    currentSettings = cloneSettings(nextSettings);
    configureChartPalette(currentSettings.theme.graphColors);
    const {
      backgroundColor: bgCol,
      surfaceColor: surfCol,
      accentColor: accCol,
      mutedColor: mutCol,
    } = currentSettings.theme;

    renderer.setBackgroundColor(bgCol);

    header.borderColor = accCol;
    header.backgroundColor = surfCol;
    headerLeft.backgroundColor = surfCol;
    title.text = currentSettings.title.toUpperCase();
    title.color = accCol;
    title.backgroundColor = surfCol;
    tagDivider.fg = mutCol;
    taglineBox.backgroundColor = surfCol;
    tagline1.content = currentSettings.headerLine1;
    tagline1.fg = mutCol;
    tagline2.content = currentSettings.headerLine2;
    tagline2.fg = mutCol;

    dateTimeFormatter = new Intl.DateTimeFormat(currentSettings.locale, {
      timeZone: currentSettings.timeZone,
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    timeFormatter = new Intl.DateTimeFormat(currentSettings.locale, {
      timeZone: currentSettings.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    clock.fg = accCol;
    clock.content = formatCurrentDateTime();

    body.borderColor = accCol;
    body.backgroundColor = bgCol;
    sidebar.backgroundColor = bgCol;
    navigationScroll.rootOptions = { backgroundColor: bgCol };
    navigationScroll.viewportOptions = { backgroundColor: bgCol };
    navigationScroll.contentOptions = {
      backgroundColor: bgCol,
      flexDirection: 'column',
      paddingRight: 1,
    };
    navigationScroll.verticalScrollbarOptions = {
      trackOptions: { foregroundColor: accCol, backgroundColor: bgCol },
    };
    navigationList.backgroundColor = bgCol;
    sidebarDivider.fg = accCol;

    for (let i = 0; i < navigationTabs.length; i++) {
      const isSelected = i === activeNavigationIndex;
      const tab = navigationTabs[i];
      const label = navigationLabels[i];
      if (tab) {
        tab.borderColor = isSelected ? accCol : surfCol;
        tab.backgroundColor = isSelected ? accCol : bgCol;
      }
      if (label) {
        label.fg = isSelected ? bgCol : accCol;
      }
    }

    footer.borderColor = accCol;
    footer.backgroundColor = surfCol;
    footerText.fg = accCol;
    renderFooter();

    const savedSettingsIndex = settingsView.getSelectedIndex();
    activeView.deactivate?.();
    body.remove(activeView.root);
    dashboardController.destroy();

    dashboardView = createDashboard(renderer, currentSettings);
    sessionsView = createSessionsView(renderer, currentSettings.theme);
    sessionsController = new SessionsController(
      sessionsView,
      services.sessionService,
      services.categoryService,
      currentSettings,
    );
    statisticsView = createStatisticsView(renderer, currentSettings);
    statisticsController = new StatisticsController(
      statisticsView,
      services.statisticsService,
      currentSettings,
    );
    dashboardController = new DashboardController(
      dashboardView,
      services.sessionService,
      services.categoryService,
      services.statisticsService,
      services.todoService,
      currentSettings,
      () => {
        sessionsController.refresh();
        statisticsController.refresh();
      },
      services.deadlineService,
    );
    categoriesView = createCategoriesView(renderer, currentSettings.theme);
    categoriesController = new CategoriesController(
      categoriesView,
      services.categoryService,
      services.statisticsService,
      currentSettings,
    );
    todosView = createTodosView(renderer, currentSettings.theme);
    todosController = new TodosController(
      todosView,
      services.todoService,
      services.categoryService,
      currentSettings,
    );
    deadlinesView = createDeadlinesView(renderer, currentSettings.theme);
    deadlinesController = new DeadlinesController(
      deadlinesView,
      services.deadlineService,
      currentSettings,
    );
    settingsView = createSettingsView(renderer, currentSettings.theme);
    settingsController = new SettingsController(settingsView, currentSettings, themes, {
      onSaved(updatedSettings, updatedMsg) {
        reloadUi(updatedSettings, updatedMsg);
      },
    });

    views[0] = {
      root: dashboardView.root,
      activate: () => {
        dashboardView.scrollBox.focus();
        if (dashboardInitialized) dashboardController.initialize();
      },
      deactivate: () => dashboardView.scrollBox.blur(),
      handleKey: (key) => dashboardController.handleKey(key),
    };
    views[1] = sessionsView;
    views[2] = statisticsView;
    views[3] = categoriesView;
    views[4] = todosView;
    views[5] = deadlinesView;
    views[6] = settingsView;

    dashboardController.initialize();
    sessionsController.initialize();
    statisticsController.initialize();
    categoriesController.initialize();
    todosController.initialize();
    deadlinesController.initialize();
    settingsController.initialize();

    settingsView.setSelectedIndex(savedSettingsIndex);
    if (statusMessage) {
      settingsView.setStatus(statusMessage);
    }

    activeView = views[activeNavigationIndex]!;
    body.add(activeView.root);
    activeView.activate?.();

    updateResponsiveLayout(renderer.width, renderer.height);
    renderer.requestRender();
  };

  const destroyed = new Promise<void>((resolve) => {
    renderer.once('destroy', () => {
      dashboardController.destroy();
      clearInterval(clockInterval);
      renderer.keyInput.off('keypress', onKeyPress);
      renderer.off('resize', updateResponsiveLayout);
      resolve();
    });
  });

  try {
    dashboardController.initialize();
    dashboardInitialized = true;
    sessionsController.initialize();
    statisticsController.initialize();
    categoriesController.initialize();
    todosController.initialize();
    deadlinesController.initialize();
    settingsController.initialize();
  } catch (error) {
    renderer.destroy();
    await destroyed;
    throw error;
  }

  await destroyed;
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    theme: { ...settings.theme, graphColors: [...settings.theme.graphColors] },
    appearance: { ...settings.appearance },
  };
}
