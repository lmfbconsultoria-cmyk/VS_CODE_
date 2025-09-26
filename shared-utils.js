/**
 * Toggles the color theme between light and dark and saves the preference.
 */
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('color-theme', isDark ? 'dark' : 'light');
    
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    if (darkIcon && lightIcon) {
        darkIcon.classList.toggle('hidden', !isDark);
        lightIcon.classList.toggle('hidden', isDark);
    }
}

/**
 * Initializes the color theme based on localStorage or system preference.
 * This should be called on DOMContentLoaded.
 */
function initializeTheme() {
    const themeToggleButton = document.getElementById('theme-toggle');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');

    const isDark = document.documentElement.classList.contains('dark');

    if (darkIcon && lightIcon) {
        darkIcon.classList.toggle('hidden', !isDark);
        lightIcon.classList.toggle('hidden', isDark);
    }

    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
}

/**
 * Wraps a calculation function in a try-catch block to prevent crashes.
 * @param {function} calcFunction - The function to execute.
 * @param {string} errorMessage - A user-friendly error message.
 * @returns The result of the function or an error object.
 */
function safeCalculation(calcFunction, errorMessage) {
    try {
        return calcFunction();
    } catch (error) {
        console.error(errorMessage, error);
        return { error: errorMessage, success: false };
    }
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds have elapsed.
 * @param {function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {function} The new debounced function.
 */
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

/**
 * Toggles the loading state of a button, showing a spinner and disabling it.
 * @param {boolean} isLoading - Whether to show the loading state.
 * @param {string} buttonId - The ID of the button to update.
 */
function setLoadingState(isLoading, buttonId) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    if (isLoading) {
        if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<span class="flex items-center justify-center"><svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Calculating...</span>`;
    } else {
        if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
        button.disabled = false;
    }
}

/**
 * Performs linear interpolation for a given value within a dataset.
 * This is commonly used for looking up values in normative tables.
 * @param {number} x - The point at which to evaluate the interpolated value.
 * @param {number[]} xp - The array of x-coordinates of the data points.
 * @param {number[]} fp - The array of y-coordinates of the data points.
 * @returns {number} The interpolated y-value.
 */
function interpolate(x, xp, fp) {
    if (x <= xp[0]) return fp[0];
    if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
    let i = 0;
    while (x > xp[i + 1]) i++;
    const x1 = xp[i], y1 = fp[i];
    const x2 = xp[i + 1], y2 = fp[i + 1];
    return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
}

/**
 * Validates a set of inputs against a predefined set of rules.
 * @param {object} inputs - The input values to validate.
 * @param {object} rules - The validation rules object.
 * @returns {{errors: string[], warnings: string[]}} - An object containing arrays of error and warning messages.
 */
function validateInputs(inputs, rules) {
    const errors = [];
    const warnings = [];

    if (rules) {
        for (const [key, rule] of Object.entries(rules)) {
            const value = inputs[key];
            const label = rule.label || key;

            if (rule.required && (value === undefined || value === '' || (typeof value === 'number' && isNaN(value)))) {
                errors.push(`${label} is required.`);
                continue;
            }
            if (typeof value === 'number' && !isNaN(value)) {
                if (rule.min !== undefined && value < rule.min) errors.push(`${label} must be at least ${rule.min}.`);
                if (rule.max !== undefined && value > rule.max) errors.push(`${label} must be no more than ${rule.max}.`);
            }
        }
    }
    return { errors, warnings };
}

/**
 * Renders validation errors and warnings into an HTML string.
 * @param {{errors?: string[], warnings?: string[]}} validation - The validation result object.
 * @param {HTMLElement} [container] - Optional. The container element to set the innerHTML of.
 * @returns {string} - The generated HTML string.
 */
function renderValidationResults(validation, container) {
    let html = '';
    if (validation.errors && validation.errors.length > 0) {
        html += `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md my-4"><p class="font-bold">Input Errors Found:</p><ul class="list-disc list-inside mt-2">${validation.errors.map(e => `<li>${e}</li>`).join('')}</ul><p class="mt-2">Please correct the errors and run the check again.</p></div>`;
    }
    if (validation.warnings && validation.warnings.length > 0) {
        html += `<div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-md my-4"><p class="font-bold">Warnings:</p><ul class="list-disc list-inside mt-2">${validation.warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>`;
    }
    if (container) container.innerHTML = html;
    return html;
}

/**
 * Sanitizes a string to prevent XSS by escaping HTML special characters.
 * @param {string | number} str - The string or number to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeHTML(str) {
    if (typeof str !== 'string') {
        // If it's not a string (e.g., a number), convert it safely.
        return String(str);
    }
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Displays a temporary feedback message to the user.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - If true, displays the message as an error.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
function showFeedback(message, isError = false, feedbackElId = 'feedback-message') {
    const feedbackEl = document.getElementById(feedbackElId);
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.className = `text-center mt-2 text-sm h-5 ${isError ? 'text-red-600' : 'text-green-600'}`;
    setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
}

/**
 * Copies the content of a given container to the clipboard as rich text, with proper image handling for Word.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} feedbackElId - The ID of the feedback element.
 */
async function handleCopyToClipboard(containerId, feedbackElId = 'feedback-message') {
    const container = document.getElementById(containerId);
    if (!container || !container.innerHTML.trim()) {
        showFeedback('No report content to copy.', true, feedbackElId);
        return;
    }

    // Create a clean clone to manipulate
    const clone = container.cloneNode(true);

    // Prepare the clone for copying
    clone.querySelectorAll('.details-row').forEach(row => row.classList.add('is-visible'));
    clone.querySelectorAll('button').forEach(btn => btn.remove());
    clone.querySelectorAll('canvas').forEach(canvas => canvas.remove());

    // Track conversion failures
    let conversionFailures = 0;

    // --- SVG to PNG Conversion (Enhanced) ---
    const svgElements = Array.from(clone.querySelectorAll('svg'));
    for (const svg of svgElements) {
        try {
            // Get more accurate dimensions
            const computedStyle = getComputedStyle(svg);
            const rect = svg.getBoundingClientRect();
            
            let width = rect.width || parseFloat(computedStyle.width) || 400;
            let height = rect.height || parseFloat(computedStyle.height) || 300;
            
            // Ensure minimum dimensions
            width = Math.max(width, 100);
            height = Math.max(height, 100);
            
            // Check if SVG has visible content
            const svgText = svg.textContent || '';
            const hasVisibleContent = width > 10 && height > 10 && 
                                    (svg.children.length > 0 || svgText.trim().length > 0);
            
            if (!hasVisibleContent) {
                console.warn('SVG appears to be empty or too small:', svg);
                svg.remove();
                continue;
            }

            const pngImage = await convertSvgToPng(svg, width, height);
            if (pngImage) {
                const containerDiv = document.createElement('div');
                containerDiv.style.textAlign = 'center';
                containerDiv.style.margin = '10px 0';
                containerDiv.style.border = '1px solid #ddd';
                containerDiv.style.padding = '10px';
                containerDiv.style.backgroundColor = '#f9f9f9';
                
                // Add a caption with the SVG text content if available
                const caption = svg.textContent || svg.getAttribute('aria-label') || 'Chart';
                if (caption && caption.trim().length > 0) {
                    const captionEl = document.createElement('div');
                    captionEl.textContent = caption;
                    captionEl.style.fontStyle = 'italic';
                    captionEl.style.marginTop = '5px';
                    captionEl.style.fontSize = '10pt';
                    captionEl.style.color = '#666';
                    containerDiv.appendChild(pngImage);
                    containerDiv.appendChild(captionEl);
                } else {
                    containerDiv.appendChild(pngImage);
                }
                
                svg.parentNode.replaceChild(containerDiv, svg);
            } else {
                conversionFailures++;
                // If conversion fails, try to keep the SVG as-is or create a placeholder
                const placeholder = document.createElement('div');
                placeholder.innerHTML = `<strong>Chart: </strong>${svg.textContent || 'Image not available'}`;
                placeholder.style.border = '1px solid #ffcccc';
                placeholder.style.padding = '10px';
                placeholder.style.backgroundColor = '#fff5f5';
                placeholder.style.margin = '10px 0';
                svg.parentNode.replaceChild(placeholder, svg);
            }
        } catch (e) {
            console.error("Error processing SVG:", e);
            conversionFailures++;
            svg.remove(); // Remove problematic SVG
        }
    }

    // --- Handle regular images ---
    const regularImages = Array.from(clone.querySelectorAll('img'));
    for (const img of regularImages) {
        try {
            // Ensure images have proper attributes for Word
            if (!img.alt) img.alt = 'Image';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            
            // Wrap images in a container for better formatting
            const containerDiv = document.createElement('div');
            containerDiv.style.textAlign = 'center';
            containerDiv.style.margin = '10px 0';
            img.parentNode.insertBefore(containerDiv, img);
            containerDiv.appendChild(img);
        } catch (e) {
            console.warn('Error processing regular image:', e);
        }
    }

    // Apply Word-compatible styles
    applyWordCompatibleStyles(clone);

    // Create HTML content
    const htmlContent = createWordCompatibleHTML(clone.innerHTML);

    try {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const plainTextBlob = new Blob([createPlainTextFallback(clone)], { type: 'text/plain' });
        
        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': plainTextBlob
            })
        ]);
        
        let feedbackMessage = 'Report copied to clipboard! You can paste it into Word.';
        if (conversionFailures > 0) {
            feedbackMessage += ` (${conversionFailures} images may need manual adjustment)`;
        }
        showFeedback(feedbackMessage, false, feedbackElId);
    } catch (err) {
        console.warn('Modern clipboard API failed, attempting fallback:', err);
        try {
            // --- FALLBACK MECHANISM ---
            await fallbackCopyToClipboard(htmlContent);
            showFeedback('Report copied using fallback. Formatting may vary.', false, feedbackElId);
        } catch (fallbackErr) {
            console.error('Fallback clipboard method also failed:', fallbackErr);
            showFeedback('Copy failed. Please select the report content manually and copy.', true, feedbackElId);
        }
    }
}

/**
 * Enhanced SVG to PNG conversion with better text handling and sizing
 */
async function convertSvgToPng(svg, width, height) {
    return new Promise((resolve) => {
        try {
            // Create a copy of the SVG to avoid modifying the original
            const svgCopy = svg.cloneNode(true);
            
            // Ensure the SVG has proper dimensions
            if (!svgCopy.hasAttribute('width')) {
                svgCopy.setAttribute('width', width + 'px');
            }
            if (!svgCopy.hasAttribute('height')) {
                svgCopy.setAttribute('height', height + 'px');
            }
            
            // Set viewBox if not present to ensure proper scaling
            if (!svgCopy.hasAttribute('viewBox')) {
                svgCopy.setAttribute('viewBox', `0 0 ${width} ${height}`);
            }
            
            // Ensure text elements are properly styled for conversion
            const textElements = svgCopy.querySelectorAll('text');
            textElements.forEach(text => {
                if (!text.getAttribute('font-family')) {
                    text.setAttribute('font-family', 'Arial, sans-serif');
                }
                if (!text.getAttribute('font-size')) {
                    text.setAttribute('font-size', '12px');
                }
            });

            const xml = new XMLSerializer().serializeToString(svgCopy);
            const svg64 = btoa(unescape(encodeURIComponent(xml)));
            const image64 = 'data:image/svg+xml;base64,' + svg64;

            const image = new Image();
            image.onload = function() {
                // Use the actual SVG dimensions or computed dimensions
                const actualWidth = svgCopy.getAttribute('width') ? 
                    parseInt(svgCopy.getAttribute('width')) : width;
                const actualHeight = svgCopy.getAttribute('height') ? 
                    parseInt(svgCopy.getAttribute('height')) : height;
                
                // Add padding to prevent cutting off content
                const padding = 20;
                const canvasWidth = Math.max(actualWidth, width) + padding * 2;
                const canvasHeight = Math.max(actualHeight, height) + padding * 2;
                
                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d');
                
                // White background for Word compatibility
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                
                // Draw the image with padding
                ctx.drawImage(image, padding, padding, actualWidth, actualHeight);
                
                const pngImage = new Image();
                pngImage.src = canvas.toDataURL('image/png');
                pngImage.style.maxWidth = '100%';
                pngImage.style.height = 'auto';
                pngImage.style.display = 'block';
                pngImage.style.margin = '0 auto';
                pngImage.alt = 'Chart image'; // Add alt text for accessibility
                
                resolve(pngImage);
            };
            image.onerror = () => {
                console.warn('SVG to PNG conversion failed for:', svg);
                resolve(null);
            };
            image.src = image64;
        } catch (e) {
            console.error('SVG conversion error:', e);
            resolve(null);
        }
    });
}

/**
 * Alternative approach: Export as HTML file that Word can open directly
 */
function exportAsHTMLFile(containerId, filename = 'report.html') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const content = container.innerHTML;
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        img { max-width: 100%; height: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Applies inline styles to an element based on its Tailwind-like classes.
 * This is a simplified mapping for Word compatibility.
 * @param {HTMLElement} element - The element to style.
 */
function applyWordCompatibleStyles(element) {
    const classToStyleMap = {
        // Text
        'font-bold': 'font-weight: bold;',
        'font-semibold': 'font-weight: 600;',
        'font-medium': 'font-weight: 500;',
        'text-center': 'text-align: center;',
        'text-right': 'text-align: right;',
        'text-sm': 'font-size: 0.875rem;',
        'text-base': 'font-size: 1rem;',
        'text-lg': 'font-size: 1.125rem;',
        'text-xl': 'font-size: 1.25rem;',
        'text-2xl': 'font-size: 1.5rem;',
        'text-3xl': 'font-size: 1.875rem;',
        'text-4xl': 'font-size: 2.25rem;',
        'uppercase': 'text-transform: uppercase;',

        // Colors (simplified for Word)
        'text-red-700': 'color: #b91c1c;',
        'text-yellow-700': 'color: #a16207;',
        'text-blue-700': 'color: #1d4ed8;',
        'text-gray-500': 'color: #6b7280;',
        'text-gray-600': 'color: #4b5563;',

        // Backgrounds
        'bg-gray-50': 'background-color: #f9fafb;',
        'bg-gray-100': 'background-color: #f3f4f6;',
        'bg-red-100': 'background-color: #fee2e2;',
        'bg-yellow-100': 'background-color: #fef9c3;',
        'bg-blue-100': 'background-color: #dbeafe;',

        // Borders
        'border': 'border: 1px solid #e5e7eb;',
        'border-b': 'border-bottom-width: 1px; border-bottom-style: solid; border-bottom-color: #e5e7eb;',
        'border-l-4': 'border-left: 4px solid;',
        'border-red-500': 'border-color: #ef4444;',
        'border-yellow-500': 'border-color: #eab308;',
        'border-blue-500': 'border-color: #3b82f6;',
        'rounded-md': 'border-radius: 0.375rem;',
        'rounded-lg': 'border-radius: 0.5rem;',

        // Padding & Margin
        'p-4': 'padding: 1rem;',
        'p-6': 'padding: 1.5rem;',
        'py-2': 'padding-top: 0.5rem; padding-bottom: 0.5rem;',
        'px-4': 'padding-left: 1rem; padding-right: 1rem;',
        'mt-2': 'margin-top: 0.5rem;',
        'mt-4': 'margin-top: 1rem;',
        'mt-6': 'margin-top: 1.5rem;',
        'mt-8': 'margin-top: 2rem;',
        'mb-2': 'margin-bottom: 0.5rem;',
        'mb-4': 'margin-bottom: 1rem;',

        // Layout
        'grid': 'display: grid;',
        'grid-cols-2': 'grid-template-columns: repeat(2, minmax(0, 1fr));',
        'gap-4': 'gap: 1rem;',
        'gap-6': 'gap: 1.5rem;',
        'w-full': 'width: 100%;',

        // Misc
        'list-disc': 'list-style-type: disc;',
        'list-inside': 'list-style-position: inside;',
    };

    // Special handling for table elements
    if (element.tagName === 'TABLE') {
        element.style.borderCollapse = 'collapse';
        element.style.width = '100%';
    }
    if (element.tagName === 'TH' || element.tagName === 'TD') {
        element.style.border = '1px solid #cccccc';
        element.style.padding = '8px';
        element.style.textAlign = 'left';
    }
    if (element.tagName === 'TH') {
        element.style.backgroundColor = '#f2f2f2';
        element.style.fontWeight = 'bold';
    }

    let styleString = element.getAttribute('style') || '';
    
    element.classList.forEach(cls => {
        if (classToStyleMap[cls]) {
            styleString += classToStyleMap[cls] + ' ';
        }
    });

    if (styleString) {
        element.setAttribute('style', styleString.trim());
    }

    // Recursively apply to children
    element.childNodes.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
            applyWordCompatibleStyles(child);
        }
    });
}

/**
 * Creates Word-compatible HTML structure
 */
function createWordCompatibleHTML(content) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <style>
        body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.15;
            color: #000000;
            margin: 0.5in;
        }
        img { max-width: 100%; height: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid black; padding: 4pt 8pt; }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

/**
 * Creates a plain text fallback for the clipboard
 */
function createPlainTextFallback(element) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = element.innerHTML;
    
    // Remove images and other non-text elements for plain text version
    tempDiv.querySelectorAll('img, svg, canvas').forEach(el => el.remove());
    
    return tempDiv.textContent || tempDiv.innerText || 'Report content';
}

/**
 * Fallback method for copying when Clipboard API is not available
 */
function fallbackCopyToClipboard(htmlContent) {
    const tempElement = document.createElement('div');
    tempElement.innerHTML = htmlContent;
    tempElement.style.position = 'fixed';
    tempElement.style.left = '-9999px';
    document.body.appendChild(tempElement);
    
    try {
        const range = document.createRange();
        range.selectNodeContents(tempElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        document.execCommand('copy');
        selection.removeAllRanges();
        showFeedback('Report copied using fallback. Formatting may be lost.', false, 'feedback-message');
        return true;
    } catch (e) {
        showFeedback('Copy failed. Please select and copy manually.', true, 'feedback-message');
        return false;
    } finally {
        document.body.removeChild(tempElement);
    }
}

/**
 * Gathers values from a list of input IDs.
 * @param {string[]} inputIds - An array of input element IDs.
 * @returns {Object} An object with keys as input IDs and values as their values.
 */
function gatherInputsFromIds(inputIds) { // Updated for better validation
    const inputs = {};
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            let value;
            if (el.type === 'number') {
                value = parseFloat(el.value);
                // Handle NaN cases gracefully
                inputs[id] = isNaN(value) ? 0 : value;
            } else if (el.type === 'checkbox') {
                inputs[id] = el.checked;
            } else {
                inputs[id] = el.value || ''; // Ensure we don't get undefined
            }
        } else {
            // Provide default for missing elements
            inputs[id] = '';
        }
    });
    return inputs;
}

/**
 * Saves a given data object to a text file.
 * @param {Object} data - The JavaScript object to save.
 * @param {string} filename - The name of the file to download.
 */
function saveInputsToFile(data, filename) {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Triggers the file input to open the file selection dialog.
 * @param {string} fileInputId - The ID of the hidden file input element.
 */
function initiateLoadInputsFromFile(fileInputId = 'file-input') {
    document.getElementById(fileInputId)?.click();
}

/**
 * Creates a generic "save inputs" event handler.
 * @param {string[]} inputIds - The array of input IDs to gather values from.
 * @param {string} filename - The default filename for the saved file.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 * @returns {function} An event handler function.
 */
function createSaveInputsHandler(inputIds, filename, feedbackElId = 'feedback-message') {
    return function() {
        const inputs = gatherInputsFromIds(inputIds);
        saveInputsToFile(inputs, filename);
        showFeedback(`Inputs saved to ${filename}`, false, feedbackElId);
    };
}

/**
 * Creates a generic "load inputs" event handler for a file input.
 * @param {string[]} inputIds - The array of input IDs to populate.
 * @param {function} onComplete - A callback function to run after inputs are loaded (e.g., re-run calculation).
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 * @returns {function} An event handler function that takes the file input event.
 */
function createLoadInputsHandler(inputIds, onComplete, feedbackElId = 'feedback-message') {
    return function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const inputs = JSON.parse(e.target.result);
                inputIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && inputs[id] !== undefined) {
                        el.type === 'checkbox' ? (el.checked = inputs[id]) : (el.value = inputs[id]);
                    }
                });
                showFeedback('Inputs loaded successfully!', false, feedbackElId);
                if (typeof onComplete === 'function') onComplete();
            } catch (err) {
                showFeedback('Failed to load inputs. Data may be corrupt.', true, feedbackElId);
                console.error("Error parsing saved data:", err);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    };
}