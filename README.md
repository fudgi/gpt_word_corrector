# Word Corrector (GPT)

A browser extension that provides AI-powered text correction and translation using ChatGPT. Select text on any webpage and get instant corrections through a convenient popup interface.

## Features

- **Text Correction**: Improve grammar and style
- **Translation**: Translate to natural English
- **Context Menu**: Right-click on editable text to access
- **Smart Insertion**: Automatically replaces text in original location
- **Caching**: Reduces API calls with built-in caching
- **Rate Limiting**: Prevents API abuse
- **Keyboard Shortcuts**: Quick access with Ctrl+Shift+1/2 (Alt+Shift+1/2 on Mac)
- **Modular Architecture**: Clean, maintainable codebase

## Project Structure

```
word_correctior/
├── apps/extension/src/         # Extension source code (modular components)
│   ├── content.js              # Main content script entry point
│   ├── ui/popup.js             # Popup UI logic
│   ├── ui/ui.js                # UI components and styling
│   ├── text/textInsertion.js   # Smart text replacement
│   ├── text/directInsertion.js # Keyboard shortcut handling
│   ├── utils/eventListeners.js # Event management
│   ├── utils/e2eInfra.js        # E2E testing infrastructure (guards, bridges)
│   ├── utils/helpers.js         # Utility functions
│   └── constants.js            # Configuration constants
├── apps/extension/static/  # Static extension files
│   ├── manifest.json       # Extension configuration
│   ├── content.css         # Popup styling
│   └── icons/              # Extension icons
├── tests/                 # E2E tests (Playwright)
│   ├── e2e/               # Test specs
│   │   ├── context.spec.js
│   │   ├── hotkey.spec.js
│   │   └── helpers/       # Test helpers
│   └── setup/             # Test setup & fixtures
├── apps/extension/corrector/   # Built extension (generated)
├── apps/proxy/server.js        # Express proxy server
├── apps/extension/vite.config.js # Build configuration
├── apps/shared-contract/     # Shared constants and error helpers
├── playwright.config.js   # E2E test configuration
└── package.json           # Dependencies & scripts
```

## Components

**Source Code (apps/extension/src/)**

- `content.js`: Main content script entry point
- `background.js`: Background service worker logic
- `ui/popup.js`: Popup UI logic and state management
- `ui/ui.js`: UI components and DOM manipulation
- `text/textInsertion.js`: Smart text replacement algorithms
- `text/directInsertion.js`: Keyboard shortcut handling
- `utils/eventListeners.js`: Event management and delegation
- `utils/e2eInfra.js`: E2E testing infrastructure (DOM hotkeys, message bridge)
- `utils/helpers.js`: Utility functions and helpers
- `constants.js`: Configuration and constants

**Static Files (apps/extension/static/)**

- `manifest.json`: Chrome extension configuration (Manifest V3)
- `content.css`: Dark theme styling for popup interface
- `icons/`: Extension icons (16px, 48px, 128px)

**Build System**

- `apps/extension/vite.config.js`: Vite build configuration with custom plugin
- Automatically copies static files to `apps/extension/corrector/` directory
- Bundles and optimizes source code for production

**Proxy Server**

- `apps/proxy/server.js`: Express server with OpenAI API integration
- Rate limiting (60 req/min), caching (5min TTL), request deduplication
- Registration endpoint: `POST /v1/register` issues an `install_token`
- Transform endpoint: `POST /v1/transform` requires `Authorization: Bearer <install_token>`

**E2E Testing (tests/)**

- `e2e/`: Playwright test specs for context menu and hotkey functionality
- `e2e/helpers/`: Test utilities like `enableE2E()` for test mode activation
- `setup/`: Test fixtures and global setup/teardown (mock proxy server)

## Installation & Setup

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Configure Environment**
   Create `.env` file:

   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Build Extension**

   ```bash
   # Development build with watch mode
   npm start

   # Production build
   npm run build:prod

   # Development build (one-time)
   npm run build
   ```

4. **Start Server**

   ```bash
   npm run server
   ```

   Server runs on `http://localhost:8787`

5. **Load Extension**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select `apps/extension/corrector/` folder

## Usage

### Context Menu

1. Select text on any webpage
2. Right-click → "Correct"
3. Choose mode: "Polish" or "To English"
4. Click "Apply" to replace text

### Keyboard Shortcuts

- **Ctrl+Shift+1** (Windows/Linux) or **Alt+Shift+1** (Mac): Polish selected text (improve grammar and style)
- **Ctrl+Shift+2** (Windows/Linux) or **Alt+Shift+2** (Mac): Translate selected text to English

Select text and press the hotkey for instant correction without opening the popup interface.

## API Authorization

The extension registers its installation on first use to obtain an `install_token`.
Requests to `/v1/transform` include `Authorization: Bearer <install_token>` and the
proxy uses that token to enforce rate limits or bans.

## Dependencies

**Runtime Dependencies**

- `express`: Web server framework
- `express-rate-limit`: API rate limiting
- `node-fetch`: HTTP client for API requests
- `dotenv`: Environment variable management

**Development Dependencies**

- `vite`: Modern build tool for bundling and development

**AI Model**

- Uses GPT-4o-mini model (temperature: 0.3, max tokens: 500)

## Development

### Build Process

The project uses Vite for building the browser extension:

1. **Source Code**: Located in `src/` directory with modular components
2. **Static Files**: Extension assets in `static/` directory
3. **Build Output**: Generated `apps/extension/corrector/` directory contains the complete extension
4. **Watch Mode**: `npm start` rebuilds automatically on file changes

### File Organization

- **Modular Architecture**: Each feature is separated into its own module
- **Clean Separation**: UI logic, text manipulation, and event handling are isolated
- **Easy Maintenance**: Clear file structure makes debugging and updates straightforward

### Adding Features

1. Create new modules in `src/` directory
2. Import and use in `content.js` or other entry points
3. Run build process to generate updated extension
4. Reload extension in Chrome to test changes

### E2E Testing

The project uses Playwright for end-to-end testing with Chrome extension support.

```bash
# Run all E2E tests
npm test
```

**E2E Infrastructure (`src/e2eInfra.js`)**

- `isE2EEnabled()`: Checks if E2E mode is active via `data-pw-e2e` DOM attribute
- `isLocalhostHost()`: Guards E2E features to localhost only
- `registerE2EBridge()`: Message bridge for simulating context menu clicks
- `registerE2EDomHotkeys()`: DOM-level hotkeys (Ctrl+Shift+1/2) for testing

**Test Helpers (`tests/e2e/helpers/`)**

- `enableE2E(page)`: Activates E2E mode by setting DOM attribute

**Mock Server**

- Tests use a mock proxy server (globalSetup/globalTeardown) that returns deterministic responses
- No real OpenAI API calls during testing

## Troubleshooting

- **Extension not working**: Ensure server is running on port 8787
- **Build errors**: Check that all imports are correct in source files
- **API errors**: Check OpenAI API key and credits
- **Text not inserting**: Try different input field
- **Rate limiting**: Wait before next request
- **Extension not updating**: Reload extension in Chrome after rebuilding

## Planned Features

- **API Keys & Limits**: Enhanced authentication and rate limiting
- **Message Logging**: Database storage for all correction requests
- **Custom Prompts**: User-defined correction templates
- **Language Support**: Additional translation languages
