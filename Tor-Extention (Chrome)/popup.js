const ipBeforeEl = document.getElementById("ipBefore");
const ipAfterEl = document.getElementById("ipAfter");
const toggleBtn = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const hostInput = document.getElementById("host");
const portInput = document.getElementById("port");
const statusIndicator = document.getElementById("statusIndicator");
const leakStatus = document.getElementById("leakStatus");

let torEnabled = false;
let isProcessing = false;
let ipCache = { before: null, after: null, beforeCountry: null, afterCountry: null, timestamp: 0 };
let activeTimeouts = new Set(); // Track timeouts for cleanup
let activeAbortControllers = new Set(); // Track abort controllers for cleanup
const CACHE_DURATION = 30000; // 30 seconds cache
const IP_FETCH_TIMEOUT = 3000; // Reduced to 3s for faster failure detection
const PROXY_SETTLE_TIME = 50; // Reduced to 50ms - proxy is ready immediately
const COUNTRY_FETCH_TIMEOUT = 2000; // 2s timeout for country lookup

// Validate host input
function validateHostInput(host) {
  const trimmed = host.trim();
  if (!trimmed) return { valid: false, error: "Host cannot be empty" };
  if (
    trimmed !== "localhost" &&
    trimmed !== "127.0.0.1" &&
    !/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed)
  ) {
    return { valid: false, error: "Invalid host format" };
  }
  return { valid: true, value: trimmed };
}

// Validate port input
function validatePortInput(port) {
  const portNum = parseInt(port, 10);
  if (isNaN(portNum)) {
    return { valid: false, error: "Port must be a number" };
  }
  if (portNum < 1 || portNum > 65535) {
    return { valid: false, error: "Port must be between 1 and 65535" };
  }
  return { valid: true, value: portNum };
}

// Fetch country for an IP address (non-blocking, cached)
async function fetchCountry(ip, isAfter = null) {
  if (!ip || ip === "Unknown" || ip === "Failed to fetch") {
    return null;
  }

  // Determine cache key based on current state or parameter
  const cacheKey = isAfter !== null ? (isAfter ? "after" : "before") : (torEnabled ? "after" : "before");
  const countryCacheKey = isAfter !== null ? (isAfter ? "afterCountry" : "beforeCountry") : (torEnabled ? "afterCountry" : "beforeCountry");
  const now = Date.now();
  
  // Return cached country if IP matches and cache is valid
  if (ipCache[cacheKey] === ip && ipCache[countryCacheKey] && (now - ipCache.timestamp) < CACHE_DURATION) {
    return ipCache[countryCacheKey];
  }

  const controller = new AbortController();
  activeAbortControllers.add(controller);
  
  try {
    const timeoutId = setTimeout(() => {
      controller.abort();
      activeTimeouts.delete(timeoutId);
    }, COUNTRY_FETCH_TIMEOUT);
    activeTimeouts.add(timeoutId);
    
    // Use ip-api.com - free, fast, no API key needed (HTTP for free tier)
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country`, {
      signal: controller.signal,
      cache: "no-cache"
    });
    
    clearTimeout(timeoutId);
    activeTimeouts.delete(timeoutId);
    activeAbortControllers.delete(controller);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const country = data.country || null;
    
    // Update cache
    if (country) {
      ipCache[countryCacheKey] = country;
      ipCache.timestamp = now;
      saveIPCache();
    }
    
    return country;
  } catch (e) {
    // Cleanup on error
    activeAbortControllers.delete(controller);
    // Return cached country if available
    return ipCache[countryCacheKey] || null;
  }
}

async function fetchIP(useCache = true) {
  const now = Date.now();
  const cacheKey = torEnabled ? "after" : "before";
  
  // Return cached IP if still valid
  if (useCache && ipCache[cacheKey] && (now - ipCache.timestamp) < CACHE_DURATION) {
    const country = ipCache[torEnabled ? "afterCountry" : "beforeCountry"] || null;
    return { ip: ipCache[cacheKey], country, success: true, cached: true };
  }

  const controller = new AbortController();
  activeAbortControllers.add(controller);
  
  try {
    const timeoutId = setTimeout(() => {
      controller.abort();
      activeTimeouts.delete(timeoutId);
    }, IP_FETCH_TIMEOUT);
    activeTimeouts.add(timeoutId);
    
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
      cache: "no-cache"
    });
    
    clearTimeout(timeoutId);
    activeTimeouts.delete(timeoutId);
    activeAbortControllers.delete(controller);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ip = data.ip || "Unknown";
    
    // Update cache
    ipCache[cacheKey] = ip;
    ipCache.timestamp = now;
    // Save cache asynchronously without blocking
    saveIPCache();
    
    // Fetch country in background (non-blocking)
    const isAfter = cacheKey === "after";
    fetchCountry(ip, isAfter).then(country => {
      if (country) {
        const countryCacheKey = isAfter ? "afterCountry" : "beforeCountry";
        ipCache[countryCacheKey] = country;
        saveIPCache();
        // Update UI if element is still showing this IP
        updateIPDisplay(cacheKey, ip, country);
      }
    }).catch(() => {
      // Silently fail - country is optional
    });
    
    return { ip, country: null, success: true, cached: false };
  } catch (e) {
    // Cleanup on error
    activeAbortControllers.delete(controller);
    // Return cached value on error if available
    if (ipCache[cacheKey]) {
      const country = ipCache[torEnabled ? "afterCountry" : "beforeCountry"] || null;
      return { ip: ipCache[cacheKey], country, success: true, cached: true };
    }
    return { ip: "Failed to fetch", country: null, success: false };
  }
}

// Helper function to format IP display with country
function formatIPDisplay(ip, country) {
  if (!ip || ip === "—" || ip === "Loading...") return ip;
  if (country) {
    return `${ip} (${country})`;
  }
  return ip;
}

// Update IP display element
function updateIPDisplay(cacheKey, ip, country) {
  const element = cacheKey === "before" ? ipBeforeEl : ipAfterEl;
  if (element && element.textContent.includes(ip.split(' ')[0])) {
    element.textContent = formatIPDisplay(ip, country);
  }
}

async function updateBefore(forceRefresh = false) {
  if (!forceRefresh && ipCache.before && (Date.now() - ipCache.timestamp) < CACHE_DURATION) {
    const country = ipCache.beforeCountry || null;
    ipBeforeEl.textContent = formatIPDisplay(ipCache.before, country);
    ipBeforeEl.className = "success";
    return;
  }
  
  ipBeforeEl.textContent = "Loading...";
  ipBeforeEl.className = "loading";
  const result = await fetchIP(true);
  ipBeforeEl.textContent = formatIPDisplay(result.ip, result.country);
  ipBeforeEl.className = result.success ? "success" : "error";
  
  // Fetch country in background if not cached
  if (result.success && result.ip !== "Unknown" && !result.country) {
    fetchCountry(result.ip, false).then(country => {
      if (country) {
        ipCache.beforeCountry = country;
        saveIPCache();
        if (ipBeforeEl.textContent.includes(result.ip)) {
          ipBeforeEl.textContent = formatIPDisplay(result.ip, country);
        }
      }
    }).catch(() => {});
  }
}

async function updateAfter(forceRefresh = false) {
  if (!torEnabled) {
    ipAfterEl.textContent = "—";
    ipAfterEl.className = "";
    return;
  }
  
  if (!forceRefresh && ipCache.after && (Date.now() - ipCache.timestamp) < CACHE_DURATION) {
    const country = ipCache.afterCountry || null;
    ipAfterEl.textContent = formatIPDisplay(ipCache.after, country);
    ipAfterEl.className = "success";
    return;
  }
  
  ipAfterEl.textContent = "Loading...";
  ipAfterEl.className = "loading";
  
  // Minimal delay - proxy is ready immediately, just need to ensure routing
  await new Promise((r) => {
    const timeoutId = setTimeout(r, PROXY_SETTLE_TIME);
    activeTimeouts.add(timeoutId);
  });
  
  const result = await fetchIP(true);
  ipAfterEl.textContent = formatIPDisplay(result.ip, result.country);
  ipAfterEl.className = result.success ? "success" : "error";
  
  // Fetch country in background if not cached
  if (result.success && result.ip !== "Unknown" && !result.country) {
    fetchCountry(result.ip, true).then(country => {
      if (country) {
        ipCache.afterCountry = country;
        saveIPCache();
        if (ipAfterEl.textContent.includes(result.ip)) {
          ipAfterEl.textContent = formatIPDisplay(result.ip, country);
        }
      }
    }).catch(() => {});
  }
}

function setUI(enabled) {
  torEnabled = enabled;
  isProcessing = false;
  toggleBtn.disabled = false;
  toggleBtn.textContent = enabled ? "Disable Tor" : "Enable Tor";
  toggleBtn.className = enabled ? "btn-danger" : "btn-success";
  
  if (statusIndicator) {
    statusIndicator.className = enabled ? "indicator active" : "indicator";
    statusIndicator.textContent = enabled ? "●" : "○";
  }
  
  if (leakStatus) {
    leakStatus.textContent = enabled
      ? "WebRTC & DNS: Protected"
      : "WebRTC & DNS: Not Protected";
    leakStatus.className = enabled ? "leak-protected" : "leak-unprotected";
  }
  
  if (!enabled) {
    ipAfterEl.textContent = "—";
    ipAfterEl.className = "";
  }
}

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status-${type}`;
}

// Prevent rapid clicks
let lastClickTime = 0;
const CLICK_DEBOUNCE = 500; // 500ms debounce

toggleBtn.addEventListener("click", async () => {
  const now = Date.now();
  if (isProcessing || (now - lastClickTime) < CLICK_DEBOUNCE) return;
  lastClickTime = now;

  if (!torEnabled) {
    // Validate inputs before enabling
    const hostValidation = validateHostInput(hostInput.value);
    const portValidation = validatePortInput(portInput.value);

    if (!hostValidation.valid) {
      setStatus(`Error: ${hostValidation.error}`, "error");
      hostInput.focus();
      return;
    }

    if (!portValidation.valid) {
      setStatus(`Error: ${portValidation.error}`, "error");
      portInput.focus();
      return;
    }

    isProcessing = true;
    toggleBtn.disabled = true;
    setStatus("Enabling Tor proxy and blocking WebRTC leaks...", "info");

    chrome.runtime.sendMessage(
      { type: "enable", host: hostValidation.value, port: portValidation.value },
      async (resp) => {
        if (chrome.runtime.lastError) {
          setStatus(
            `Error: ${chrome.runtime.lastError.message}`,
            "error"
          );
          isProcessing = false;
          toggleBtn.disabled = false;
          return;
        }

        if (resp && resp.ok) {
          // Update UI immediately - proxy is already active
          setUI(true);
          setStatus(
            "✓ Tor proxy enabled. WebRTC & DNS leaks blocked.",
            "success"
          );
          // Update IP asynchronously in background - don't wait
          // Start immediately with minimal delay
          const timeoutId = setTimeout(() => {
            updateAfter().catch(() => {});
            activeTimeouts.delete(timeoutId);
          }, PROXY_SETTLE_TIME);
          activeTimeouts.add(timeoutId);
        } else {
          setStatus(
            `Failed: ${(resp && resp.err) || "Unknown error"}`,
            "error"
          );
          isProcessing = false;
          toggleBtn.disabled = false;
        }
      }
    );
  } else {
    isProcessing = true;
    toggleBtn.disabled = true;
    setStatus("Disabling proxy and restoring settings...", "info");

    chrome.runtime.sendMessage({ type: "disable" }, (resp) => {
      if (chrome.runtime.lastError) {
        setStatus(
          `Error: ${chrome.runtime.lastError.message}`,
          "error"
        );
        isProcessing = false;
        toggleBtn.disabled = false;
        return;
      }

      if (resp && resp.ok) {
        setUI(false);
        setStatus("Proxy disabled. Back to direct connection.", "success");
        // Clear Tor IP cache
        ipCache.after = null;
        ipCache.afterCountry = null;
        // Update IP asynchronously
        updateBefore(true).catch(() => {});
      } else {
        setStatus(
          `Failed: ${(resp && resp.err) || "Unknown error"}`,
          "error"
        );
        isProcessing = false;
        toggleBtn.disabled = false;
      }
    });
  }
});

// Load IP cache from storage
async function loadIPCache() {
  try {
    const result = await chrome.storage.local.get(["ipCache"]);
    if (result.ipCache) {
      const cacheAge = Date.now() - (result.ipCache.timestamp || 0);
      if (cacheAge < CACHE_DURATION) {
        ipCache = result.ipCache;
        return true;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return false;
}

// Save IP cache to storage
function saveIPCache() {
  chrome.storage.local.set({ ipCache }).catch(() => {
    // Ignore errors
  });
}

// Cleanup function for when popup closes
function cleanup() {
  // Clear all active timeouts
  activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  activeTimeouts.clear();
  // Abort all active fetch requests
  activeAbortControllers.forEach(controller => controller.abort());
  activeAbortControllers.clear();
}

// Initialize popup
(async () => {
  // Load cache and status in parallel for faster initialization
  const [cacheResult, items] = await Promise.all([
    loadIPCache(),
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "status" }, (items) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(items);
      });
    })
  ]);

  if (items) {
    setUI(items.torEnabled);
    hostInput.value = items.torHost || "127.0.0.1";
    portInput.value = items.torPort || 9150;
  } else {
    setStatus("Error loading status", "error");
  }
  
  // Load cached IPs immediately for instant UI
  const now = Date.now();
  if (ipCache.before && (now - ipCache.timestamp) < CACHE_DURATION) {
    const country = ipCache.beforeCountry || null;
    ipBeforeEl.textContent = formatIPDisplay(ipCache.before, country);
    ipBeforeEl.className = "success";
  } else {
    // Only fetch if cache is expired or missing
    updateBefore().catch(() => {});
  }
  
  if (items?.torEnabled) {
    if (ipCache.after && (now - ipCache.timestamp) < CACHE_DURATION) {
      const country = ipCache.afterCountry || null;
      ipAfterEl.textContent = formatIPDisplay(ipCache.after, country);
      ipAfterEl.className = "success";
    } else {
      // Only fetch if cache is expired or missing
      updateAfter().catch(() => {});
    }
  }
})();

// Cleanup on popup close
window.addEventListener("beforeunload", cleanup);

// Debounce function for input validation
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Optimized input validation with debouncing
const validateHostInputDebounced = debounce(() => {
  const validation = validateHostInput(hostInput.value);
  if (!validation.valid && hostInput.value.trim()) {
    hostInput.style.borderColor = "#dc3545";
  } else {
    hostInput.style.borderColor = "#ddd";
  }
}, 300);

const validatePortInputDebounced = debounce(() => {
  const validation = validatePortInput(portInput.value);
  if (!validation.valid && portInput.value.trim()) {
    portInput.style.borderColor = "#dc3545";
  } else {
    portInput.style.borderColor = "#ddd";
  }
}, 300);

hostInput.addEventListener("blur", validateHostInputDebounced);
portInput.addEventListener("blur", validatePortInputDebounced);
