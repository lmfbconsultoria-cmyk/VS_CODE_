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

    initializeBackToTopButton();
}

/**
 * Initializes the "Back to Top" button functionality.
 * It shows the button on scroll and handles the scroll-to-top action.
 */
function initializeBackToTopButton() {
    const backToTopButton = document.getElementById('back-to-top-btn');
    if (!backToTopButton) return;

    // Show or hide the button based on scroll position
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopButton.classList.remove('opacity-0', 'invisible');
            backToTopButton.classList.add('opacity-100', 'visible');
        } else {
            backToTopButton.classList.remove('opacity-100', 'visible');
            backToTopButton.classList.add('opacity-0', 'invisible');
        }
    });

    // Scroll to top on click
    backToTopButton.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
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
 * Gathers all CSS rules from the document's stylesheets into a single string.
 * This is crucial for embedding styles into SVGs for correct rendering during export.
 * @returns {string} A string containing all CSS rules wrapped in a <style> tag.
 */
function getAllCssStyles() {
    let cssText = "";
    for (const styleSheet of document.styleSheets) {
        try {
            if (styleSheet.cssRules) {
                for (const rule of styleSheet.cssRules) {
                    cssText += rule.cssText;
                }
            }
        } catch (e) {
            console.warn("Could not read CSS rules from stylesheet:", styleSheet.href, e);
        }
    }
    return `<style>${cssText}</style>`;
}

/**
 * Converts an SVG element to a PNG image, embedding all necessary styles.
 * @param {SVGElement} svg - The SVG element to convert.
 * @returns {Promise<HTMLImageElement|null>} A promise that resolves with an HTML <img> element or null on failure.
 */
async function convertSvgToPng(svg) {
    return new Promise((resolve, reject) => {
        try {
            const clone = svg.cloneNode(true);
            const width = svg.getBoundingClientRect().width || 500;
            const height = svg.getBoundingClientRect().height || 300;

            clone.setAttribute('width', width);
            clone.setAttribute('height', height);

            // Embed all page styles into the SVG for correct rendering
            const styles = getAllCssStyles();
            const defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
            defs.innerHTML = styles;
            clone.insertBefore(defs, clone.firstChild);

            const xml = new XMLSerializer().serializeToString(clone);
            const svg64 = btoa(unescape(encodeURIComponent(xml)));
            const dataUrl = 'data:image/svg+xml;base64,' + svg64;

            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Fill background with white for better compatibility
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(image, 0, 0);

                const pngImage = new Image();
                pngImage.src = canvas.toDataURL('image/png');
                pngImage.style.maxWidth = '100%';
                pngImage.style.height = 'auto';
                resolve(pngImage);
            };
            image.onerror = (e) => {
                console.error("Image loading error during SVG conversion:", e);
                reject(new Error("Image could not be loaded for conversion."));
            };
            image.src = dataUrl;
        } catch (e) {
            console.error('Error during SVG to PNG conversion:', e);
            reject(e);
        }
    });
}

/**
 * Copies the content of a given container to the clipboard, converting SVGs to images.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} feedbackElId - The ID of the feedback element.
 */
async function handleCopyToClipboard(containerId, feedbackElId = 'feedback-message') {
    const container = document.getElementById(containerId);
    if (!container) {
        showFeedback('Report container not found.', true, feedbackElId);
        return;
    }

    const clone = container.cloneNode(true);

    // Prepare the clone for copying
    clone.classList.add('copy-friendly');
    clone.querySelectorAll('button, .print-hidden, [data-copy-ignore]').forEach(el => el.remove());
    clone.querySelectorAll('.details-row').forEach(row => row.classList.add('is-visible'));

    let conversionFailures = 0;
    const svgElements = Array.from(clone.querySelectorAll('svg'));

    for (const svg of svgElements) {
        try {
            const pngImage = await convertSvgToPng(svg);
            if (pngImage && svg.parentNode) {
                svg.parentNode.replaceChild(pngImage, svg);
            }
        } catch (error) {
            console.warn("SVG to PNG conversion failed:", error);
            conversionFailures++;
            if (svg.parentNode) svg.parentNode.remove(); // Remove SVG if conversion fails
        }
    }

    const htmlContent = clone.innerHTML;
    const plainTextContent = clone.innerText || clone.textContent;

    try {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });
        await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ]);

        let feedback = 'Report copied successfully!';
        if (conversionFailures > 0) {
            feedback = `Report copied, but ${conversionFailures} diagram(s) could not be converted.`;
        }
        showFeedback(feedback, false, feedbackElId);
    } catch (err) {
        console.error('Clipboard API failed:', err);
        showFeedback('Copy failed. Your browser may not support this feature.', true, feedbackElId);
    }
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
 * Downloads the content of a given container as a PDF file.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} filename - The desired filename for the downloaded PDF.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
async function handleDownloadPdf(containerId, filename, feedbackElId = 'feedback-message') {
    const reportContainer = document.getElementById(containerId);
    if (!reportContainer) {
        showFeedback('Report container not found for PDF export.', true, feedbackElId);
        return;
    }
    if (typeof html2pdf === 'undefined') {
        showFeedback('PDF generation library is not loaded.', true, feedbackElId);
        return;
    }
    
    showFeedback('Generating PDF...', false, feedbackElId);

    // --- Get Header Info ---
    const projectTitle = document.getElementById('main-title')?.innerText || 'Engineering Report';
    const reportDate = new Date().toLocaleDateString();

    // --- Configure PDF Options ---
    const opt = {
        margin:       0.5,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // --- Generate PDF with Custom Header ---
    await html2pdf().from(reportContainer).set(opt).toPdf().get('pdf').then(function (pdf) {
        const totalPages = pdf.internal.getNumberOfPages();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(10);
            pdf.setTextColor(100); // Gray color
            // Header
            pdf.text(projectTitle, pageWidth / 2, 0.3, { align: 'center' });
            pdf.text(`Date: ${reportDate}`, pageWidth - 0.5, 0.3, { align: 'right' });
            // Footer
            pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 0.3, { align: 'center' });
        }
    }).save();
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
        const displayEl = document.getElementById('file-name-display');
        const file = event.target.files[0];
        if (!file) {
            if (displayEl) displayEl.textContent = '';
            return;
        }

        if (displayEl) displayEl.textContent = sanitizeHTML(file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const inputs = JSON.parse(e.target.result);
                inputIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && inputs[id] !== undefined) { // Check for undefined, not just truthiness
                        if (el.type === 'checkbox') {
                            el.checked = !!inputs[id];
                        } else {
                            el.value = inputs[id];
                        }
                        // Trigger change event for selects to update UI
                        if (el.tagName === 'SELECT') {
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });
                showFeedback('Inputs loaded successfully!', false, feedbackElId);
                event.target.value = ''; // Reset file input only on success
                if (typeof onComplete === 'function') onComplete();
            } catch (err) {
                showFeedback('Failed to load inputs. Data may be corrupt.', true, feedbackElId);
                console.error("Error parsing saved data:", err);
            } finally {
                if (displayEl) displayEl.textContent = ''; // Clear filename display after processing
            }
        };
        reader.readAsText(file);
    };
}

/**
 * Saves a key-value pair to the browser's local storage.
 * @param {string} storageKey - The key to use for storing the data.
 * @param {object} inputs - The input data object to be stringified and saved.
 */
function saveInputsToLocalStorage(storageKey, inputs) {
    try {
        const dataStr = JSON.stringify(inputs);
        localStorage.setItem(storageKey, dataStr);
    } catch (error) {
        console.error('Could not save inputs to local storage:', error);
    }
}

/**
 * Loads and applies saved inputs from local storage.
 * @param {string} storageKey - The key to retrieve data from.
 * @param {string[]} inputIds - An array of input element IDs to populate.
 * @param {function} [onComplete] - An optional callback to run after inputs are loaded.
 */
function loadInputsFromLocalStorage(storageKey, inputIds, onComplete) {
    const dataStr = localStorage.getItem(storageKey);
    if (!dataStr) {
        return; // No saved data found.
    }
    try {
        const inputs = JSON.parse(dataStr);
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && inputs[id] !== undefined) {
                if (el.type === 'checkbox') {
                    el.checked = !!inputs[id];
                } else {
                    el.value = inputs[id];
                }
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        if (typeof onComplete === 'function') onComplete();
    } catch (error) {
        console.error('Could not load inputs from local storage:', error);
    }
}