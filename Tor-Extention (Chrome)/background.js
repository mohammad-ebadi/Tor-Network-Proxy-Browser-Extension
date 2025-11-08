// background.js
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9150;

// Validate and sanitize host input
function validateHost(host) {
  if (!host || typeof host !== "string") return DEFAULT_HOST;
  // Allow localhost, 127.0.0.1, or valid IP format
  const hostTrimmed = host.trim();
  if (
    hostTrimmed === "localhost" ||
    hostTrimmed === "127.0.0.1" ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostTrimmed)
  ) {
    return hostTrimmed;
  }
  return DEFAULT_HOST;
}

// Validate port input
function validatePort(port) {
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return DEFAULT_PORT;
  }
  return portNum;
}

// Block WebRTC to prevent IP leaks
function blockWebRTC(enable, callback) {
  chrome.privacy.network.webRTCIPHandlingPolicy.set(
    {
      value: enable ? "disable_non_proxied_udp" : "default",
      scope: "regular",
    },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "WebRTC blocking failed:",
          chrome.runtime.lastError.message
        );
      }
      callback && callback();
    }
  );
}

// Optimized: Set WebRTC and proxy as fast as possible
function setWebRTCAndProxy(host, port, callback) {
  const validatedHost = validateHost(host);
  const validatedPort = validatePort(port);
  
  // Pre-generate PAC script for faster execution
  const pacScript = `function FindProxyForURL(url, host) { return 'SOCKS5 ${validatedHost}:${validatedPort}'; }`;

  // Set WebRTC blocking and proxy settings
  // Note: These must be sequential due to Chrome API limitations
  blockWebRTC(true, () => {
    chrome.proxy.settings.set(
      {
        value: { mode: "pac_script", pacScript: { data: pacScript } },
        scope: "regular",
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Proxy set failed:", chrome.runtime.lastError.message);
          callback && callback({ ok: false, err: chrome.runtime.lastError.message });
        } else {
          // Callback immediately - don't wait for storage
          callback && callback({ ok: true });
          // Save state asynchronously (non-blocking)
          chrome.storage.local.set({
            torEnabled: true,
            torHost: validatedHost,
            torPort: validatedPort,
          }).catch(() => {
            // Ignore storage errors - state is already set
          });
        }
      }
    );
  });
}

function setProxy(host = DEFAULT_HOST, port = DEFAULT_PORT, callback) {
  // Use optimized function
  setWebRTCAndProxy(host, port, callback);
}

function clearProxy(callback) {
  // Restore WebRTC to default, then clear proxy
  blockWebRTC(false, () => {
    chrome.proxy.settings.set(
      { value: { mode: "direct" }, scope: "regular" },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Proxy clear failed:", chrome.runtime.lastError.message);
          callback && callback({ ok: false, err: chrome.runtime.lastError.message });
        } else {
          // Callback immediately - don't wait for storage
          callback && callback({ ok: true });
          // Save state asynchronously (non-blocking)
          chrome.storage.local.set({ torEnabled: false }).catch(() => {
            // Ignore storage errors
          });
        }
      }
    );
  });
}

// Message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "enable") {
    const host = validateHost(msg.host);
    const port = validatePort(msg.port);
    setProxy(host, port, sendResponse);
    return true; // async response
  } else if (msg.type === "disable") {
    clearProxy(sendResponse);
    return true;
  } else if (msg.type === "status") {
    chrome.storage.local.get(
      { torEnabled: false, torHost: DEFAULT_HOST, torPort: DEFAULT_PORT },
      sendResponse
    );
    return true;
  }
  return false;
});
