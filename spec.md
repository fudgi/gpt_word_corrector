# Word Corrector (GPT) - Technical Specifications

## 1. Project Overview

**Word Corrector (GPT)** is a Chrome browser extension that provides AI-powered text correction and translation using ChatGPT. The extension allows users to select text on any webpage and get instant corrections through a convenient popup interface or keyboard shortcuts.

### 1.1 Core Functionality
- **Text Correction**: Improve grammar and style of selected text
- **Translation**: Translate selected text to natural English
- **Multiple Input Methods**: Context menu, keyboard shortcuts, and direct text insertion
- **Smart Text Replacement**: Automatically replaces text in the original location
- **Caching**: Reduces API calls with built-in caching mechanism
- **Rate Limiting**: Prevents API abuse with request throttling

## 2. Architecture

### 2.1 System Architecture

The extension follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
├─────────────────────────────────────────────────────────┤
│  Content Script (content.js)                            │
│  ├── Event Listeners (eventListeners.js)                │
│  ├── Popup UI (popup.js)                                │
│  ├── Direct Correction (directCorrection.js)            │
│  ├── Text Insertion (textInsertion.js)                  │
│  ├── UI Components (ui.js)                             │
│  └── Helpers (helpers.js)                               │
├─────────────────────────────────────────────────────────┤
│  Background Service Worker (background.js)               │
│  ├── Context Menu Handler                               │
│  ├── Keyboard Shortcut Handler                          │
│  └── API Proxy Communication                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Express Proxy Server (server.js)                       │
│  ├── Rate Limiting (60 req/min)                        │
│  ├── Request Deduplication                             │
│  ├── Caching (5min TTL)                                │
│  └── OpenAI API Integration                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              OpenAI API (GPT-4o-mini)                    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

#### Content Script Layer (`src/`)
- **content.js**: Main entry point, prevents duplicate injection
- **eventListeners.js**: Manages all event listeners (context menu, keyboard shortcuts, messages)
- **popup.js**: Creates and manages the popup UI with Shadow DOM
- **directCorrection.js**: Handles keyboard shortcut-based corrections
- **textInsertion.js**: Smart text replacement for different input types
- **ui.js**: UI components (popup, notifications, loading indicators)
- **helpers.js**: Utility functions (selection range, background communication)
- **constants.js**: Configuration constants and messages

#### Background Service Worker (`static/background.js`)
- Context menu creation and click handling
- Keyboard shortcut command handling
- Message passing between content script and proxy server
- API request proxying

#### Proxy Server (`server.js`)
- Express.js server with rate limiting
- Request caching and deduplication
- OpenAI API integration
- Error handling and validation

## 3. Features Specification

### 3.1 Text Correction Modes

#### 3.1.1 Polish Mode
- **Purpose**: Improve grammar and style while preserving meaning
- **Model**: GPT-4o-mini
- **Temperature**: 0.3
- **Max Tokens**: 500
- **Keyboard Shortcut**: `Alt+Shift+P`
- **System Prompt**: "You are a writing assistant. Improve grammar and tone. Keep meaning. Return only the result, no explanations."

#### 3.1.2 Translate to English Mode
- **Purpose**: Translate text to natural English and fix grammar
- **Model**: GPT-4o-mini
- **Temperature**: 0.3
- **Max Tokens**: 500
- **Keyboard Shortcut**: `Alt+Shift+E`
- **System Prompt**: "You are a writing assistant. Translate to natural English. Fix grammar. Return only the result, no explanations."

### 3.2 User Interface Features

#### 3.2.1 Popup Interface
- **Location**: Positioned near cursor/context menu click
- **Styling**: Shadow DOM with dark theme
- **Components**:
  - Mode selection buttons (Polish / To English)
  - Status display (shows current operation)
  - Result preview area
  - Apply button (disabled until result received)
- **Behavior**:
  - Auto-runs correction on open
  - Updates when mode changes
  - Closes on Apply or outside click
  - Shows cached indicator when applicable

#### 3.2.2 Notifications
- **Types**: Success, Error, Info
- **Display**: Temporary overlay notifications
- **Styling**: Dark theme with appropriate icons
- **Auto-dismiss**: After a few seconds

#### 3.2.3 Loading Indicators
- **Display**: Status message during API request
- **Text**: Mode-specific loading messages
- **Location**: Popup status area or notification

### 3.3 Text Input Methods

#### 3.3.1 Context Menu
- **Trigger**: Right-click on editable text
- **Menu Item**: "Correct"
- **Behavior**: Opens popup with selected text

#### 3.3.2 Keyboard Shortcuts
- **Polish**: `Alt+Shift+P`
- **Translate**: `Alt+Shift+E`
- **Behavior**: Direct correction without popup, shows notification

#### 3.3.3 Text Insertion Support
The extension supports three types of text inputs:

1. **Standard Input Fields** (`<input>`, `<textarea>`)
   - Uses `selectionStart` and `selectionEnd`
   - Direct value manipulation
   - Caret positioning after insertion

2. **ContentEditable Elements**
   - Uses `Range` API
   - Tries `execCommand("insertText")` first
   - Falls back to manual DOM manipulation
   - Proper cursor positioning

3. **Document Selection**
   - Uses `Range` API for arbitrary text selection
   - Direct DOM text node insertion
   - Works on any selectable text

**Fallback**: If insertion fails, text is copied to clipboard

### 3.4 Event Handling

#### 3.4.1 Input Events
The extension emits proper input events for compatibility:
- `beforeinput` event (bubbles, cancelable)
- `input` event (bubbles, non-cancelable)
- Both events include `inputType: "insertText"` and `data` property

## 4. API Specifications

### 4.1 Proxy Server API

#### 4.1.1 Endpoint: `POST /v1/transform`

**Request Body**:
```json
{
  "mode": "polish" | "to_en",
  "text": "string (max 2000 chars)",
  "style": "formal" (currently fixed)
}
```

**Response (Success)**:
```json
{
  "output": "corrected/translated text",
  "cached": boolean
}
```

**Response (Error)**:
```json
{
  "error": "error message",
  "details": "detailed error description"
}
```

**Status Codes**:
- `200`: Success
- `400`: Bad request (invalid input, missing text, invalid mode)
- `429`: Rate limit exceeded
- `500`: Server error

#### 4.1.2 Rate Limiting
- **Window**: 60 seconds
- **Max Requests**: 60 per window
- **Implementation**: `express-rate-limit` middleware

#### 4.1.3 Caching
- **TTL**: 5 minutes
- **Key Format**: `${mode}:${style}:${text}`
- **Storage**: In-memory Map
- **Cleanup**: Automatic when cache size exceeds 1000 entries
- **Response**: Includes `cached: true` flag when served from cache

#### 4.1.4 Request Deduplication
- **Purpose**: Prevent duplicate API calls for identical requests
- **Implementation**: Pending requests map
- **Behavior**: Multiple identical requests share the same API call

### 4.2 Extension Message API

#### 4.2.1 Content Script → Background

**Message Types**:

1. **RUN_GPT**
   ```javascript
   {
     type: "RUN_GPT",
     mode: "polish" | "to_en",
     text: "string",
     style: "formal"
   }
   ```

2. **OPEN_CORRECTOR** (from context menu)
   ```javascript
   {
     type: "OPEN_CORRECTOR",
     selectionText: "string"
   }
   ```

3. **OPEN_CORRECTOR_HOTKEY** (from keyboard shortcut)
   ```javascript
   {
     type: "OPEN_CORRECTOR_HOTKEY",
     command: "polish" | "to_en"
   }
   ```

#### 4.2.2 Background → Content Script

**Response Format**:
```javascript
{
  ok: boolean,
  output?: "string",
  cached?: boolean,
  error?: "string",
  retryable?: boolean
}
```

## 5. Technical Specifications

### 5.1 Browser Extension Manifest

**Manifest Version**: 3

**Permissions**:
- `contextMenus`: Create context menu items
- `scripting`: Inject content scripts
- `storage`: Store extension data (future use)
- `activeTab`: Access active tab content

**Host Permissions**: `<all_urls>`

**Content Scripts**:
- **Matches**: `<all_urls>`
- **Files**: `content.js`, `content.css`
- **Run At**: `document_idle`
- **Match About Blank**: `true`

**Commands**:
- `polish`: `Alt+Shift+P`
- `to_en`: `Alt+Shift+E`

**Web Accessible Resources**:
- `src/popup.css`
- `src/notification.css`

### 5.2 Build System

**Build Tool**: Vite 5.0.0

**Build Configuration** (`vite.config.js`):
- Custom plugin to copy static files to `corrector/` directory
- Bundles source files from `src/` directory
- Output directory: `corrector/`

**Build Scripts**:
- `npm start`: Development build with watch mode
- `npm run build`: One-time development build
- `npm run build:prod`: Production build

### 5.3 Dependencies

#### Runtime Dependencies
- **express** (^5.1.0): Web server framework
- **express-rate-limit** (^8.1.0): API rate limiting middleware
- **node-fetch** (^3.3.2): HTTP client for API requests
- **dotenv** (^17.2.2): Environment variable management

#### Development Dependencies
- **vite** (^5.0.0): Build tool and bundler

### 5.4 Environment Configuration

**Required Environment Variables**:
- `OPENAI_API_KEY`: OpenAI API key for GPT API access

**Configuration File**: `.env` in project root

### 5.5 Server Configuration

**Port**: 8787
**URL**: `http://localhost:8787`
**Start Command**: `npm run server`

## 6. Data Flow

### 6.1 Context Menu Flow

```
User right-clicks on editable text
  ↓
Background service worker receives context menu click
  ↓
Sends message to content script: OPEN_CORRECTOR
  ↓
Content script receives message
  ↓
Creates popup UI with selected text
  ↓
Auto-runs correction (polish mode by default)
  ↓
Popup sends RUN_GPT message to background
  ↓
Background forwards request to proxy server
  ↓
Proxy server checks cache → calls OpenAI API if needed
  ↓
Response flows back through background → content script
  ↓
Popup displays result, enables Apply button
  ↓
User clicks Apply
  ↓
Text is inserted at original location
  ↓
Popup closes
```

### 6.2 Keyboard Shortcut Flow

```
User selects text and presses Alt+Shift+P/E
  ↓
Background service worker receives command
  ↓
Sends message to content script: OPEN_CORRECTOR_HOTKEY
  ↓
Content script receives message
  ↓
Gets selected text and mode from command
  ↓
Shows loading indicator
  ↓
Sends RUN_GPT message to background
  ↓
Background forwards request to proxy server
  ↓
Proxy server processes request (cache/API)
  ↓
Response flows back
  ↓
Text is directly inserted at selection location
  ↓
Shows success/error notification
```

## 7. Error Handling

### 7.1 Error Types

1. **API Errors**
   - Rate limit exceeded (429)
   - Service errors (500)
   - Network errors
   - Invalid API key

2. **Input Errors**
   - Empty text
   - Text too long (>2000 chars)
   - Invalid mode

3. **Insertion Errors**
   - Element not found
   - Element disabled/readonly
   - Selection lost

### 7.2 Error Recovery

- **Retry Logic**: Background message sending retries up to 2 times with 500ms delay
- **Fallback**: Clipboard copy if text insertion fails
- **User Feedback**: Error messages displayed in popup or notifications
- **State Preservation**: Selection info saved before API call to allow retry

## 8. Security Considerations

### 8.1 API Key Security
- API key stored in `.env` file (not committed to version control)
- Server-side only, never exposed to client
- Proxy server prevents direct client access to OpenAI API

### 8.2 Content Security
- Shadow DOM isolation for popup UI
- No inline scripts or styles
- CSP-compliant implementation

### 8.3 Rate Limiting
- Server-side rate limiting prevents abuse
- Request deduplication reduces unnecessary API calls
- Caching reduces API usage

## 9. Performance Optimizations

### 9.1 Caching Strategy
- 5-minute TTL for API responses
- In-memory cache with automatic cleanup
- Cache key includes mode, style, and text for accurate matching

### 9.2 Request Optimization
- Request deduplication prevents duplicate API calls
- Async/await for non-blocking operations
- Efficient DOM manipulation with Range API

### 9.3 Build Optimization
- Vite bundling for optimized code size
- Tree-shaking for unused code elimination
- Development watch mode for fast iteration

## 10. Testing Considerations

### 10.1 Test Scenarios

1. **Context Menu**
   - Right-click on various input types
   - Verify popup appears with correct text
   - Test mode switching
   - Test Apply button functionality

2. **Keyboard Shortcuts**
   - Test Alt+Shift+P and Alt+Shift+E
   - Verify direct correction without popup
   - Test on different input types

3. **Text Insertion**
   - Test on `<input>` fields
   - Test on `<textarea>` elements
   - Test on contentEditable elements
   - Test on document selection

4. **Error Handling**
   - Test with empty selection
   - Test with very long text
   - Test with network errors
   - Test with API errors

5. **Caching**
   - Verify cache hits return cached results
   - Verify cache TTL expiration
   - Verify cache cleanup

## 11. Future Enhancements

### 11.1 Planned Features
- **API Keys & Limits**: Enhanced authentication and per-user rate limiting
- **Message Logging**: Database storage for all correction requests
- **Custom Prompts**: User-defined correction templates
- **Language Support**: Additional translation languages beyond English

### 11.2 Potential Improvements
- **Batch Processing**: Correct multiple selections at once
- **History**: View and reuse previous corrections
- **Settings UI**: Configure extension preferences
- **Multiple AI Providers**: Support for other AI services
- **Custom Styles**: User-defined writing styles (formal, casual, etc.)

## 12. Deployment

### 12.1 Development Setup

1. Install dependencies: `npm install`
2. Create `.env` file with `OPENAI_API_KEY`
3. Build extension: `npm start` (watch mode) or `npm run build`
4. Start server: `npm run server`
5. Load extension: Chrome → `chrome://extensions/` → Load unpacked → Select `corrector/` folder

### 12.2 Production Build

1. Run: `npm run build:prod`
2. Test extension in `corrector/` directory
3. Package extension (zip `corrector/` directory)
4. Submit to Chrome Web Store (if applicable)

### 12.3 Server Deployment

- Deploy `server.js` to hosting service (e.g., Heroku, Railway, Vercel)
- Set environment variable `OPENAI_API_KEY`
- Update `PROXY_ENDPOINT` in `background.js` to production URL
- Rebuild extension with new endpoint

## 13. File Structure

```
word_correctior/
├── src/                    # Source code (modular components)
│   ├── content.js         # Main content script entry point
│   ├── popup.js           # Popup UI logic and state management
│   ├── ui.js              # UI components and DOM manipulation
│   ├── textInsertion.js   # Smart text replacement algorithms
│   ├── directCorrection.js # Keyboard shortcut handling
│   ├── eventListeners.js  # Event management and delegation
│   ├── helpers.js         # Utility functions and helpers
│   ├── constants.js       # Configuration and constants
│   ├── popup.css          # Popup styling
│   └── notification.css   # Notification styling
├── static/                # Static extension files
│   ├── manifest.json      # Extension configuration
│   ├── background.js      # Service worker & API communication
│   ├── content.css        # Content script styling
│   └── icons/             # Extension icons (16px, 48px, 128px)
├── corrector/             # Built extension (generated)
├── server.js              # Express proxy server
├── vite.config.js         # Build configuration
├── package.json           # Dependencies & scripts
├── package-lock.json      # Dependency lock file
├── README.md              # User documentation
├── specs.md               # This file
└── LICENSE                # License file
```

## 14. Version Information

- **Extension Version**: 0.1.0
- **Manifest Version**: 3
- **Node.js**: Compatible with modern Node.js versions
- **Chrome**: Requires Chrome/Chromium with Manifest V3 support

---

**Last Updated**: Based on current codebase state
**Maintainer**: See package.json for author information

