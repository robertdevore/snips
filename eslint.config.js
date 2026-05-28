const js = require('@eslint/js');

module.exports = [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				// Node.js (main process)
				__dirname: 'readonly',
				__filename: 'readonly',
				exports: 'writable',
				module: 'readonly',
				require: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				// Browser (renderer)
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				requestAnimationFrame: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				HTMLInputElement: 'readonly',
				HTMLTextAreaElement: 'readonly',
				HTMLSelectElement: 'readonly',
				HTMLDivElement: 'readonly',
				HTMLButtonElement: 'readonly',
				HTMLElement: 'readonly',
				Element: 'readonly',
				Node: 'readonly',
				Event: 'readonly',
				CustomEvent: 'readonly',
				FileReader: 'readonly',
				FileList: 'readonly',
				File: 'readonly',
				DataTransfer: 'readonly',
				CanvasRenderingContext2D: 'readonly',
				HTMLCanvasElement: 'readonly',
				Image: 'readonly',
				DOMException: 'readonly',
				ResizeObserver: 'readonly',
				MutationObserver: 'readonly',
				Blob: 'readonly',
				URL: 'readonly',
				// Browser DOM APIs
				getComputedStyle: 'readonly',
				// Electron preload
				contextBridge: 'readonly',
				ipcRenderer: 'readonly',
				// Test globals
				describe: 'readonly',
				it: 'readonly',
				test: 'readonly',
				expect: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				afterAll: 'readonly'
			}
		},
		rules: {
			// Allow console in Node and renderer
			'no-console': 'off',
			// Allow unused vars prefixed with underscore
			'no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_'
			}],
			// Allow common patterns in this codebase
			'no-constant-condition': ['warn', { checkLoops: false }],
			'no-empty': ['warn', { allowEmptyCatch: true }],
			'no-prototype-builtins': 'warn',
			'no-case-declarations': 'warn'
		}
	},
	{
		// Main process and preload files: Node.js CommonJS
		files: ['app/src/main/**/*.js'],
		languageOptions: {
			sourceType: 'commonjs',
			globals: {
				window: 'off'
			}
		}
	},
	{
		// Renderer files: ES modules (browser)
		files: ['app/src/renderer/**/*.js'],
		languageOptions: {
			sourceType: 'module',
			ecmaVersion: 2022
		}
	},
	{
		// Ignore patterns
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/build/**',
			'**/out/**',
			'**/release/**',
			'app/data/**',
			'helper/.build/**',
			'*.dmg',
			'*.blockmap'
		]
	}
];
