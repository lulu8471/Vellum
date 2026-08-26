(() => {
  const nativeMatch = String.prototype.match;
  const nativeFilter = Array.prototype.filter;
  const invoiceLinePattern = String.raw`^(\d{1,3})\s+[=+~\-]*\s*([A-Z0-9.]{8,18})\s+(\d{8})[.,]?\s+(.+)$`;

  document.documentElement.setAttribute("data-vellum-compat", "active");

  Object.defineProperty(String.prototype, "match", {
    configurable: true,
    writable: true,
    value(pattern) {
      const value = String(this);
      if (
        pattern instanceof RegExp &&
        pattern.source === invoiceLinePattern
      ) {
        let lines = [];
        try {
          lines = JSON.parse(document.documentElement.getAttribute("data-vellum-ocr-lines") || "[]");
        } catch {}
        lines.push(value);
        document.documentElement.setAttribute("data-vellum-ocr-lines", JSON.stringify(lines.slice(-30)));

        const normalized = value.replace(
          /^(\d{1,3})\s*[.,:;)]\s+(?=[=+~\-]*\s*[A-Z0-9.]{8,18}\s+\d{8}\b)/i,
          "$1 ",
        );
        const result = nativeMatch.call(normalized, pattern);
        document.documentElement.setAttribute(
          "data-vellum-last-prefix",
          JSON.stringify({ value, normalized, matched: Boolean(result) }),
        );
        return result;
      }
      return nativeMatch.call(value, pattern);
    },
  });

  Object.defineProperty(Array.prototype, "filter", {
    configurable: true,
    writable: true,
    value(callback, thisArg) {
      let isIssueArray = false;
      for (let index = 0; index < this.length; index += 1) {
        const item = this[index];
        if (item && typeof item === "object" && typeof item.severity === "string") {
          isIssueArray = true;
          break;
        }
      }
      if (isIssueArray) {
        try {
          document.documentElement.setAttribute("data-vellum-issues", JSON.stringify(this));
        } catch {}
      }
      return nativeFilter.call(this, callback, thisArg);
    },
  });
})();
