import { homedir } from 'node:os';
import { join } from 'node:path';

const platform = process.platform;
const home = homedir();

export const configPaths = {
  config: platform === 'win32' 
    ? join(home, 'AppData', 'Roaming', 'cjode')
    : join(home, '.config', 'cjode'),
  data: platform === 'win32'
    ? join(home, 'AppData', 'Local', 'cjode')
    : join(home, '.local', 'share', 'cjode'),
  cache: platform === 'win32'
    ? join(home, 'AppData', 'Local', 'cjode', 'cache')
    : join(home, '.cache', 'cjode')
};

// Specific file paths
export const configFiles = {
  env: join(configPaths.config, '.env'),
  settings: join(configPaths.config, 'settings.json'),
  database: join(configPaths.data, 'cjode.db'),
};
