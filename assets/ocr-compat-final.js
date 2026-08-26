(() => {
  const nativeMatch = String.prototype.match;
  const invoiceLinePattern = String.raw`^(\d{1,3})\s+[=+~\-]*\s*([A-Z0-9.]{8,18})\s+(\d{8})[.,]?\s+(.+)$`;
  const moneyPairPattern = String.raw`\$\s*([\d,]+\.\d{2})\s+\$\s*([\d,]+\.\d{2})\s*$`;

  Object.defineProperty(String.prototype, "match", {
    configurable: true,
    writable: true,
    value(pattern) {
      let value = String(this);
      if (pattern instanceof RegExp) {
        if (pattern.source === invoiceLinePattern) {
          value = value.replace(
            /^(\d{1,3})\s*[.,:;)]\s+(?=[=+~\-]*\s*[A-Z0-9.]{8,18}\s+\d{8}\b)/i,
            "$1 ",
          );
        } else if (pattern.source === moneyPairPattern) {
          value = value.replace(
            /\$\s*(\d{1,3})\.(\d{3})\.(\d{2})(?=\s|$)/g,
            "$$$1,$2.$3",
          );
        }
      }
      return nativeMatch.call(value, pattern);
    },
  });
})();
