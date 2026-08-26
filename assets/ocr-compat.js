(() => {
  const nativeMatch = String.prototype.match;
  const invoiceLinePattern = String.raw`^(\d{1,3})\s+[=+~\-]*\s*([A-Z0-9.]{8,18})\s+(\d{8})[.,]?\s+(.+)$`;

  Object.defineProperty(String.prototype, "match", {
    configurable: true,
    writable: true,
    value(pattern) {
      const value = String(this);
      if (
        pattern instanceof RegExp &&
        pattern.source === invoiceLinePattern &&
        /^\d{1,3}[.,]\s/.test(value)
      ) {
        return nativeMatch.call(value.replace(/^(\d{1,3})[.,](?=\s)/, "$1"), pattern);
      }
      return nativeMatch.call(value, pattern);
    },
  });
})();
