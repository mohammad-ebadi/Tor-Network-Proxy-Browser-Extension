# Secure Tor Proxy Extension

Enterprise-grade Chrome extension for routing browser traffic through local Tor SOCKS5 proxy with comprehensive leak protection.

## Features

- **Secure Proxy Routing**: Routes all browser traffic through local Tor SOCKS5 proxy
- **WebRTC Leak Protection**: Automatically blocks WebRTC leaks when proxy is enabled
- **DNS Leak Protection**: DNS queries routed through Tor proxy
- **IP Geolocation**: Displays current IP and country information
- **Fast Performance**: Optimized for speed with intelligent caching
- **Enterprise Ready**: Production-grade code with security best practices

## Requirements

- Chrome/Edge browser (Manifest V3 compatible)
- Tor Browser or system Tor daemon running locally
- SOCKS5 proxy on port 9150 (Tor Browser) or 9050 (system daemon)

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the extension directory

## Usage

1. Start Tor Browser or system Tor daemon
2. Click the extension icon
3. Verify host (default: 127.0.0.1) and port (default: 9150)
4. Click "Enable Tor" to activate proxy
5. Verify IP change in the extension popup

## Security

- Input validation and sanitization
- No external data collection
- All traffic routed through local Tor instance
- WebRTC and DNS leak protection
- No telemetry or tracking

## Privacy

This extension:
- Does not collect or transmit user data
- Only connects to local Tor instance
- Uses external APIs only for IP geolocation (optional)
- Stores settings locally in browser storage

## Technical Details

- **Manifest Version**: 3
- **Permissions**: storage, proxy, privacy
- **Service Worker**: background.js
- **Caching**: 30-second IP cache with persistent storage
- **Performance**: Optimized for fast connection (<100ms)

## License

This extension is provided as-is for secure browsing through Tor.

## Support

For issues or questions, please refer to the Tor Project documentation.

