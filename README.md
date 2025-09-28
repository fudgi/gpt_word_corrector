# Word Corrector (GPT)

A browser extension that provides AI-powered text correction and translation using ChatGPT. Select text on any webpage and get instant corrections through a convenient popup interface.

## Features

- **Text Correction**: Improve grammar and style
- **Translation**: Translate to natural English
- **Context Menu**: Right-click on editable text to access
- **Smart Insertion**: Automatically replaces text in original location
- **Caching**: Reduces API calls with built-in caching
- **Rate Limiting**: Prevents API abuse

## Project Structure

```
word_correctior/
├── corrector/           # Browser extension
│   ├── manifest.json   # Extension config
│   ├── background.js   # Service worker & API communication
│   ├── content.js     # Popup UI & text manipulation
│   ├── content.css    # Popup styling
│   └── icons/         # Extension icons
├── server.js          # Express proxy server
└── package.json       # Dependencies
```

## Components

**Browser Extension**
- `manifest.json`: Chrome extension configuration
- `background.js`: Context menu and API communication
- `content.js`: Popup UI and smart text insertion
- `content.css`: Dark theme styling

**Proxy Server**
- `server.js`: Express server with OpenAI API integration
- Rate limiting (60 req/min), caching (5min TTL), request deduplication
- Endpoint: `POST /v1/transform` with modes: `polish`, `to_en`

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

3. **Start Server**
   ```bash
   npm start
   ```
   Server runs on `http://localhost:8787`

4. **Load Extension**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select `corrector/` folder

## Usage

1. Select text on any webpage
2. Right-click → "Correct"
3. Choose mode: "Polish" or "To English"
4. Click "Apply" to replace text

## Dependencies

- `express`, `express-rate-limit`, `node-fetch`, `dotenv`
- Uses GPT-4o-mini model (temperature: 0.3, max tokens: 500)

## Troubleshooting

- **Extension not working**: Ensure server is running on port 8787
- **API errors**: Check OpenAI API key and credits
- **Text not inserting**: Try different input field
- **Rate limiting**: Wait before next request
