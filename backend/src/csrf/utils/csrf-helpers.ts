/**
 * Generate CSRF token meta tag for HTML templates
 */
export function generateCsrfMetaTag(token: string): string {
  return `<meta name="csrf-token" content="${token}">`
}

/**
 * Generate CSRF hidden input for forms
 */
export function generateCsrfHiddenInput(token: string): string {
  return `<input type="hidden" name="_csrf" value="${token}">`
}

/**
 * Generate JavaScript code to set CSRF token for AJAX requests
 */
export function generateCsrfJavaScript(token: string): string {
  return `
    <script>
      // Set CSRF token for jQuery AJAX requests
      if (typeof $ !== 'undefined') {
        $.ajaxSetup({
          beforeSend: function(xhr) {
            xhr.setRequestHeader('X-CSRF-Token', '${token}');
          }
        });
      }
      
      // Set CSRF token for Axios requests
      if (typeof axios !== 'undefined') {
        axios.defaults.headers.common['X-CSRF-Token'] = '${token}';
      }
      
      // Set CSRF token for Fetch API
      window.csrfToken = '${token}';
      
      // Helper function to get CSRF token
      window.getCsrfToken = function() {
        return '${token}';
      };
    </script>
  `
}

/**
 * Validate CSRF token format
 */
export function isValidCsrfTokenFormat(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false
  }

  // Check if token is valid base64url
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8")
    const parsed = JSON.parse(decoded)
    return !!(parsed.timestamp && parsed.randomValue && parsed.signature)
  } catch {
    return false
  }
}
