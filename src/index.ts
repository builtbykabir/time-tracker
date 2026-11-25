import { loadSettings, loadThemeCatalog } from './config/settings.ts';
import { createContainer } from './container.ts';
import { startUi } from './ui/app.ts';

const themes = await loadThemeCatalog();
const settings = await loadSettings(undefined, themes);
const container = createContainer();

try {
  await startUi(
    settings,
    {
      sessionService: container.sessionService,
      categoryService: container.categoryService,
      deadlineService: container.deadlineService,
      todoService: container.todoService,
      statisticsService: container.statisticsService,
    },
    themes,
  );
} finally {
  container.close();
}
