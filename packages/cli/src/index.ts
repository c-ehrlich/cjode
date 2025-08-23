// CLI package entry point
import { hello as coreHello } from '@cjode/core';
import { hello as stateHello } from '@cjode/state';

console.log('🤖 Cjode CLI starting...');
console.log(coreHello());
console.log(stateHello());
