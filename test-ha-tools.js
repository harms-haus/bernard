// Simple test to verify HA tools are enabled with REST config
const { getRouterTools } = require('./agent/harness/router/tools/index.ts');

console.log('Testing HA tool enablement...');

// Test 1: No HA config
const tools1 = getRouterTools();
console.log('No HA config:', tools1.filter(t => t.name.includes('ha_')).length, 'HA tools');

// Test 2: Only REST config
const tools2 = getRouterTools(undefined, { baseUrl: 'http://test', accessToken: 'test' });
console.log('Only REST config:', tools2.filter(t => t.name.includes('ha_')).length, 'HA tools');

console.log('Test completed successfully!');
