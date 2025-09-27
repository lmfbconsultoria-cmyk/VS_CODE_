// --- Core Calculation Utilities ---

/**
 * Creates a standardized calculation handler to reduce boilerplate code.
 * This function encapsulates the common pattern: gather, validate, calculate, render.
 * @param {object} config - The configuration object for the handler.
 * @param {string[]} config.inputIds - Array of input element IDs.
 * @param {string} config.storageKey - Local storage key for saving inputs.
 * @param {function} config.calculatorFunction - The function that performs the calculation.
 * @param {function} config.renderFunction - The function that renders the results.
 * @param {string} config.resultsContainerId - The ID of the DOM element to render results into.
 * @param {function} [config.validatorFunction] - Optional. A custom function to perform validation.
 * @param {string} [config.feedbackElId='feedback-message'] - Optional. The ID of the feedback element.
 * @param {function} [config.preCalculationHook] - Optional. A function to run after validation but before calculation. Can modify inputs.
 * @param {string} [config.buttonId] - Optional ID of the run button for loading state.
 * @returns {function} The generated event handler function.
 */
function createCalculationHandler(config) {
    const {
        inputIds,
        storageKey,
        validationRuleKey,
        calculatorFunction,
        renderFunction,
        resultsContainerId,
        validatorFunction,
        preCalculationHook,
        feedbackElId = 'feedback-message',
        buttonId
    } = config;
    
    return async function() {
        const resultsContainer = document.getElementById(resultsContainerId);

        const step = async (message, action) => {
            showFeedback(message, false, feedbackElId);
            await new Promise(resolve => setTimeout(resolve, 20)); 
            return action();
        };

        try {
            if (buttonId) setLoadingState(true, buttonId);

            const inputs = await step('Gathering inputs...', () => gatherInputsFromIds(inputIds));

            const validation = await step('Validating inputs...', () => {
                if (typeof validatorFunction === 'function') {
                    return validatorFunction(inputs);
                }
                const rules = validationRules[validationRuleKey];
                return validateInputs(inputs, rules);
            });

            if (validation.errors.length > 0) {
                renderValidationResults(validation, resultsContainer);
                showFeedback('Validation failed. Please correct the errors.', true, feedbackElId);
                if (buttonId) setLoadingState(false, buttonId);
                return;
            }

            const calculationResult = await step('Running calculation...', () => {
                return calculatorFunction(inputs, validation);
            });

            if (calculationResult.error) {
                renderValidationResults({ errors: [calculationResult.error] }, resultsContainer);
                showFeedback('Calculation failed.', true, feedbackElId);
            } else {
                await step('Rendering results...', () => {
                    saveInputsToLocalStorage(storageKey, inputs);
                    renderFunction(calculationResult);
                });
                showFeedback('Calculation complete!', false, feedbackElId);
            }

        } catch (error) {
            console.error('An unexpected error occurred in the calculation handler:', error);
            renderValidationResults({ errors: [`An unexpected error occurred: ${error.message}`] }, resultsContainer);
            showFeedback('A critical error occurred.', true, feedbackElId);
        } finally {
            if (buttonId) setLoadingState(false, buttonId);
        }
    };
}

/**
 * Updates the theme toggle icons based on the current theme.
 * @param {boolean} isDark - Whether the dark theme is active.
 */
function updateThemeIcons(isDark) {
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    if (darkIcon && lightIcon) {
        darkIcon.classList.toggle('hidden', !isDark);
        lightIcon.classList.toggle('hidden', isDark);
    }
}

/**
 * Toggles the color theme, saves the preference, and updates the icons.
 */
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('color-theme', isDark ? 'dark' : 'light');
    updateThemeIcons(isDark);
}

/**
 * Initializes the theme toggle button functionality.
 */
function initializeThemeToggle() {
    const themeToggleButton = document.getElementById('theme-toggle');
    const isDark = document.documentElement.classList.contains('dark');
    updateThemeIcons(isDark);
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', toggleTheme);
    }
}

/**
 * Populates input fields from URL query parameters.
 * This allows for sharing pre-configured calculator links.
 * e.g., ?basic_wind_speed=120&mean_roof_height=50
 */
function loadInputsFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') {
        return; // No parameters, do nothing.
    }

    let populatedCount = 0;
    params.forEach((value, key) => {
        const el = document.getElementById(key);
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = value === 'true';
            } else {
                el.value = value;
            }
            // Dispatch events to ensure any UI toggles or dependent logic is triggered.
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            populatedCount++;
        }
    });

    if (populatedCount > 0) {
        showFeedback(`${populatedCount} input(s) loaded from URL.`, false, 'feedback-message');
    }
}
/**
 * A single initialization function for all shared UI components.
 */
function initializeSharedUI() {
    initializeThemeToggle();
    initializeBackToTopButton();
    initializeUiToggles();
}
loadInputsFromURL();

/**
 * Initializes UI toggles based on data attributes for declarative UI logic.
 * Looks for `data-ui-toggle-controller` and attaches event listeners.
 *
 * Attributes:
 * - `data-ui-toggle-controller`: Marks the element as a controller.
 * - `data-ui-toggle-target`: A CSS selector for the target element(s).
 * - `data-ui-toggle-type`: 'visibility' (default) or 'disable'.
 * - `data-ui-toggle-condition-value`: The value the controller must have to trigger the action.
 * - `data-ui-toggle-condition-value`: The value(s) the controller must have to trigger the action (comma-separated for multiple values).
 * - `data-ui-toggle-condition-checked`: 'true' or 'false' for checkboxes.
 * - `data-ui-toggle-class`: The class to toggle for visibility (default: 'hidden').
 * - `data-ui-toggle-invert`: 'true' to invert the condition's result.
 */
function initializeUiToggles() {
    const controllers = document.querySelectorAll('[data-ui-toggle-controller], [data-ui-toggle-target-for]');

    controllers.forEach(controller => {
        const targetSelector = controller.dataset.uiToggleTarget;
        const conditionValue = controller.dataset.uiToggleConditionValue;
        // A single element can be a controller for its own targets, and a target for another controller.
        const isController = controller.hasAttribute('data-ui-toggle-controller');
        const isControlled = controller.hasAttribute('data-ui-toggle-target-for');

        // If it's a controller, set up its listener
        if (isController) {
            const targetSelector = controller.dataset.uiToggleTarget;
            if (targetSelector) {
                setupController(controller, targetSelector);
            }
        }

        // If it's controlled by another element, find that controller and set up the listener
        if (isControlled) {
            const controllerId = controller.dataset.uiToggleTargetFor;
            const mainController = document.getElementById(controllerId);
            if (mainController) {
                // Pass the target element itself as the selector
                setupController(mainController, `#${controller.id}`);
            }
        }
    });

    function setupController(controller, targetSelector) {
        const targetElement = document.querySelector(targetSelector);
        if (!targetElement) return;

        const conditionValue = targetElement.dataset.uiToggleConditionValue || controller.dataset.uiToggleConditionValue;
        const conditionChecked = controller.dataset.uiToggleConditionChecked;
        const toggleType = controller.dataset.uiToggleType || 'visibility';
        const toggleClass = controller.dataset.uiToggleClass || 'hidden';
        const invert = (targetElement.dataset.uiToggleInvert || controller.dataset.uiToggleInvert) === 'true';

        const updateUi = () => {
            const targets = document.querySelectorAll(targetSelector);
            if (targets.length === 0) return;

            let conditionMet = false;
            if (controller.type === 'checkbox') {
                const isChecked = controller.checked;
                if (conditionChecked) {
                    conditionMet = String(isChecked) === conditionChecked;
                } else {
                    conditionMet = isChecked;
                }
            } else { // Handles select, text, number inputs
                if (conditionValue === 'all') {
                    conditionMet = true; // Always show for 'all'
                } else if (conditionValue) {
                    const conditionValues = conditionValue.split(',').map(v => v.trim());
                    conditionMet = conditionValues.includes(controller.value);
                }
            }

            const finalCondition = invert ? !conditionMet : conditionMet;

            targets.forEach(target => {
                if (toggleType === 'visibility') target.classList.toggle(toggleClass, !finalCondition);
                else if (toggleType === 'disable') target.disabled = finalCondition;
            });
        };

        controller.addEventListener('change', updateUi);
        controller.addEventListener('input', updateUi);
        updateUi(); // Initial call to set the correct state on page load
    }
}

/**
 * Initializes the "Back to Top" button functionality.
 * It shows the button on scroll and handles the scroll-to-top action.
 */
function initializeBackToTopButton() {
    const backToTopButton = document.getElementById('back-to-top-btn');
    if (!backToTopButton) return;

    // Debounce the scroll event to improve performance
    const handleScroll = debounce(() => {
        const isVisible = window.scrollY > 300;
        backToTopButton.classList.toggle('opacity-100', isVisible);
        backToTopButton.classList.toggle('opacity-0', !isVisible);
        backToTopButton.classList.toggle('invisible', !isVisible);
    }, 150);

    window.addEventListener('scroll', handleScroll);

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
    // Input validation
    if (!Array.isArray(xp) || !Array.isArray(fp) || xp.length !== fp.length || xp.length < 2) {
        throw new Error('Invalid input arrays for interpolation');
    }
    if (!xp.every((val, i) => i === 0 || val > xp[i-1])) {
        throw new Error('x-coordinates must be in ascending order');
    }
    
    // Handle boundary conditions
    if (x <= xp[0]) return fp[0];
    if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
    
    // Find the appropriate interval
    let i = 0;
    while (i < xp.length - 1 && x > xp[i + 1]) i++;
    
    // Perform linear interpolation
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

            if (rule.required && (value === undefined || value === '' || value === null || (typeof value === 'number' && isNaN(value)))) {
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
        html += `
            <div class="validation-message error">
                <div class="flex">
                    <div class="flex-shrink-0"><svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg></div>
                    <div class="ml-3">
                        <h3 class="text-sm font-bold">Input Errors Found:</h3>
                        <div class="mt-2 text-sm"><ul class="list-disc list-inside space-y-1">${validation.errors.map(e => `<li>${e}</li>`).join('')}</ul></div>
                        <p class="mt-2 text-sm">Please correct the errors and run the check again.</p>
                    </div>
                </div>
            </div>`;
    }
    if (validation.warnings && validation.warnings.length > 0) {
        html += `
            <div class="validation-message warning">
                <div class="flex">
                    <div class="flex-shrink-0"><svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.257 3.099c.636-1.026 2.287-1.026 2.923 0l5.625 9.075A1.75 1.75 0 0115.25 15H4.75a1.75 1.75 0 01-1.555-2.826l5.625-9.075zM9 9a1 1 0 011-1h.01a1 1 0 010 2H10a1 1 0 01-1-1zm1 2a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" /></svg></div>
                    <div class="ml-3">
                        <h3 class="text-sm font-bold">Warnings:</h3>
                        <div class="mt-2 text-sm"><ul class="list-disc list-inside space-y-1">${validation.warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>
                    </div>
                </div>
            </div>`;
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

// Store timeout IDs in a map to handle multiple feedback elements and prevent race conditions.
const feedbackTimeouts = {};

/**
 * Displays a temporary feedback message to the user.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - If true, displays the message as an error.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
function showFeedback(message, isError = false, feedbackElId = 'feedback-message') {
    const feedbackEl = document.getElementById(feedbackElId);
    if (!feedbackEl) return;

    // Clear any existing timeout for this specific feedback element to prevent race conditions.
    if (feedbackTimeouts[feedbackElId]) {
        clearTimeout(feedbackTimeouts[feedbackElId]);
    }

    feedbackEl.textContent = message;
    feedbackEl.className = `text-center mt-2 text-sm h-5 ${isError ? 'text-red-600' : 'text-green-600'}`;
    feedbackTimeouts[feedbackElId] = setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
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
 * Gathers all CSS rules from the document's stylesheets into a single string.
 * This is crucial for embedding styles into SVGs for correct rendering during export.
 * @returns {string} A string containing all CSS rules wrapped in a <style> tag.
 */
function getAllCssStyles() {
    let cssText = "";
    for (const styleSheet of document.styleSheets) {
        try {
            // Check if the stylesheet is accessible (CORS policy can block access to external stylesheets)
            if (styleSheet.cssRules) {
                for (const rule of styleSheet.cssRules) {
                    cssText += rule.cssText;
                }
            }
        } catch (e) {
            // This can happen with cross-origin stylesheets. We'll log a warning but continue.
            console.warn("Could not read CSS rules from stylesheet:", styleSheet.href, e);
        }
    }
    // Wrap the collected CSS rules in a <style> tag for SVG embedding.
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
            const rect = svg.getBoundingClientRect();
            const viewBox = svg.viewBox.baseVal;

            // Prioritize dimensions in this order: rendered size, viewBox, fallback
            const width = rect.width || (viewBox && viewBox.width) || 500;
            const height = rect.height || (viewBox && viewBox.height) || 300;

            clone.setAttribute('width', width);
            clone.setAttribute('height', height);

            // Embed all page styles into the SVG for correct rendering
            const styles = getAllCssStyles();
            const defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
            defs.innerHTML = styles;
            clone.insertBefore(defs, clone.firstChild);

            clone.setAttribute('width', width);
            clone.setAttribute('height', height);

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

    // FIX: Temporarily switch to light mode for PDF generation
    const htmlElement = document.documentElement;
    const isDark = htmlElement.classList.contains('dark');
    if (isDark) {
        htmlElement.classList.remove('dark');
    }
    // End of FIX

    const projectTitle = document.getElementById('main-title')?.innerText || 'Engineering Report';
    const reportDate = new Date().toLocaleDateString();

    const opt = {
        margin:       0.5,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Use a try/finally block to ensure the theme is restored even if an error occurs
    try {
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
    } finally {
        // FIX: Restore the original theme after PDF generation
        if (isDark) {
            htmlElement.classList.add('dark');
        }
        // End of FIX
    }
}

/**
 * Copies the content of a given container to the clipboard, converting SVGs to images.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} feedbackElId - The ID of the feedback element.
 */
async function handleCopyToClipboard(containerId, feedbackElId = 'feedback-message') {
    const container = document.getElementById(containerId);
    if (!container) {
        showFeedback('Report container not found for copying.', true, feedbackElId);
        return;
    }

    try {
        showFeedback('Preparing report for copying...', false, feedbackElId);
        const clone = container.cloneNode(true);

        // --- Get Title and Date ---
        const reportTitle = document.getElementById('main-title')?.innerText || 'Calculation Report';
        const reportDate = new Date().toLocaleDateString();
        const headerHtml = `<h1 style="font-size: 16pt; font-family: 'Times New Roman', Times, serif; font-weight: bold; text-align: center;">${reportTitle}</h1><p style="font-size: 12pt; font-family: 'Times New Roman', Times, serif; text-align: center;">Date: ${reportDate}</p><hr>`;
        const headerText = `${reportTitle}\nDate: ${reportDate}\n\n---\n\n`;

        // Prepare the clone for copying: remove interactive elements and expand details.
        clone.classList.add('copy-friendly');
        clone.querySelectorAll('button, .print-hidden, [data-copy-ignore]').forEach(el => el.remove());
        clone.querySelectorAll('.details-row').forEach(row => row.classList.add('is-visible'));

        const htmlContent = headerHtml + clone.innerHTML;
        const plainTextContent = headerText + (clone.innerText || clone.textContent);

        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });
        await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ]);
        showFeedback('Report copied successfully!', false, feedbackElId);
    } catch (err) {
        console.error('Clipboard API failed:', err);
        showFeedback('Copy failed. Your browser may not support this feature.', true, feedbackElId);
    }
}

/**
 * Sends data from a calculator to the load combination page.
 * It stores the data in localStorage and redirects the user.
 * @param {object} config - The configuration object.
 * @param {object} config.loads - The key-value pairs of loads to send.
 * @param {string} config.source - The name of the source calculator (e.g., "Wind Calculator").
 * @param {string} config.type - The type of loads (e.g., "Wind", "Snow").
 * @param {string} [config.feedbackElId='feedback-message'] - The ID of the feedback element.
 * @param {string} [config.destinationUrl='combos.html'] - The URL to redirect to.
 */
function sendDataToCombos(config) {
    const { loads, source, type, feedbackElId = 'feedback-message', destinationUrl = 'combos.html' } = config;
    if (!loads || Object.keys(loads).length === 0) {
        showFeedback(`No ${type} loads to send.`, true, feedbackElId);
        return;
    }
    const dataToSend = { source, type, loads };
    localStorage.setItem('loadsForCombinator', JSON.stringify(dataToSend));
    
    // Determine the correct relative path to the destination URL
    const currentPath = window.location.pathname;
    // Count how many levels deep we are from the root.
    // e.g., /asce/wind.html -> 2 segments before filename
    // e.g., /index.html -> 1 segment before filename
    const depth = currentPath.split('/').length - 2;
    
    const relativePrefix = '../'.repeat(Math.max(0, depth));
    const finalUrl = `${relativePrefix}asce/${destinationUrl}`;

    window.location.href = finalUrl;
}

/**
 * Creates a standardized calculation handler to reduce boilerplate code.
 * This function encapsulates the common pattern: gather, validate, calculate, render.
 * @param {object} config - The configuration object for the handler.
 * @param {string[]} config.inputIds - Array of input element IDs.
 * @param {string} config.storageKey - Local storage key for saving inputs.
 * @param {string} config.validationRuleKey - Key for the validationRules object.
 * @param {function} config.calculatorFunction - The function that performs the calculation.
 * @param {function} config.renderFunction - The function that renders the results.
 * @param {string} config.resultsContainerId - The ID of the DOM element to render results into.
 * @param {function} [config.validatorFunction] - Optional. A custom function to perform validation. If not provided, a default validator is used.
 * @param {string} [config.feedbackElId='feedback-message'] - Optional. The ID of the feedback element.
 * @param {string} [config.buttonId] - Optional ID of the run button for loading state.
 * @returns {function} The generated event handler function.
 */
function createCalculationHandler(config) {
    const {
        inputIds,
        storageKey,
        validationRuleKey,
        calculatorFunction,
        renderFunction,
        resultsContainerId,
        validatorFunction,
        feedbackElId = 'feedback-message',
        buttonId
    } = config;
    
    return async function() {
        const resultsContainer = document.getElementById(resultsContainerId);

        const step = async (message, action) => {
            showFeedback(message, false, feedbackElId);
            // Yield to the main thread to allow the UI to update with the feedback message.
            await new Promise(resolve => setTimeout(resolve, 20)); 
            return action();
        };

        try {
            if (buttonId) setLoadingState(true, buttonId);

            const inputs = await step('Gathering inputs...', () => gatherInputsFromIds(inputIds));

            const validation = await step('Validating inputs...', () => {
                if (typeof validatorFunction === 'function') {
                    return validatorFunction(inputs);
                }
                const rules = validationRules[validationRuleKey];
                return validateInputs(inputs, rules);
            });

            if (validation.errors.length > 0) {
                renderValidationResults(validation, resultsContainer);
                showFeedback('Validation failed. Please correct the errors.', true, feedbackElId);
                if (buttonId) setLoadingState(false, buttonId);
                return;
            }

            // Allow a pre-calculation hook to run, which can modify inputs
            let finalInputs = inputs;
            if (typeof preCalculationHook === 'function') {
                const hookResult = await step('Running pre-calculation hook...', () => preCalculationHook(inputs, validation));
                // If the hook returns a value, use it as the new inputs
                finalInputs = hookResult !== undefined ? hookResult : inputs;
            }

            const calculationResult = await step('Running calculation...', () => {
                // Pass validation object to calculator if it accepts more than one argument
                return calculatorFunction(finalInputs, validation);
            });

            if (calculationResult.error) {
                renderValidationResults({ errors: [calculationResult.error] }, resultsContainer);
                showFeedback('Calculation failed.', true, feedbackElId);
            } else {
                await step('Rendering results...', () => {
                    saveInputsToLocalStorage(storageKey, finalInputs);
                    renderFunction(calculationResult);
                });
                showFeedback('Calculation complete!', false, feedbackElId);
            }

        } catch (error) {
            console.error('An unexpected error occurred in the calculation handler:', error);
            renderValidationResults({ errors: [`An unexpected error occurred: ${error.message}`] }, resultsContainer);
            showFeedback('A critical error occurred.', true, feedbackElId);
        } finally {
            if (buttonId) setLoadingState(false, buttonId);
        }
    };
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

    showFeedback('Preparing print view...', false, feedbackElId);

    // Store original body content and title
    const originalBody = document.body.innerHTML;
    const originalTitle = document.title;

    try {
        // Clone the report container to work with
        const reportClone = reportContainer.cloneNode(true);

        // Ensure all expandable details are visible in the clone
        reportClone.querySelectorAll('.details-row').forEach(row => {
            row.style.display = 'table-row';
        });

        // Create a temporary print-friendly body
        document.body.innerHTML = '';
        document.body.appendChild(reportClone);
        document.title = filename.replace('.pdf', '');

        // Add a temporary print stylesheet
        const printStyle = document.createElement('style');
        printStyle.textContent = `
            @media print {
                body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
                table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
                th, td { border: 1px solid #000; padding: 4px; }
                th { background-color: #f0f0f0; }
                .print-hidden, .toggle-details-btn { display: none; }
                @page { size: letter; margin: 0.75in; }
            }
        `;
        document.head.appendChild(printStyle);

        // Trigger the print dialog
        window.print();

    } finally {
        // Restore the original page content and title
        document.body.innerHTML = originalBody;
        document.title = originalTitle;
        // Re-initialize any UI elements that were in the original body
        initializeSharedUI();
        // Re-attach calculator-specific event listeners if they were lost
        // This part is tricky and might require a more robust solution if issues arise.
        // For now, we assume the main event listeners are re-attached by the page's own script.
        showFeedback('Print view closed.', false, feedbackElId);
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
            if (el.type === 'number') {
                inputs[id] = el.value === '' ? undefined : parseFloat(el.value);
            } else if (el.type === 'checkbox') {
                inputs[id] = el.checked;
            } else if (el.tagName.toLowerCase() === 'select') {
                inputs[id] = el.value || undefined;
            } else {
                inputs[id] = el.value || undefined;
            }
        } else {
            console.warn(`Element with id '${id}' not found`);
            inputs[id] = undefined;
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
            // User cancelled the dialog, clear the display if it exists
            if (displayEl) displayEl.textContent = ''; 
            return;
        }

        if (displayEl) displayEl.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedInputs = JSON.parse(e.target.result);
                inputIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && loadedInputs[id] !== undefined) {
                        el.value = loadedInputs[id];
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
                showFeedback('Inputs loaded successfully!', false, feedbackElId);
                if (typeof onComplete === 'function') onComplete();
            } catch (error) {
                showFeedback('Failed to parse input file. Ensure it is a valid JSON file.', true, feedbackElId);
            }
        };
        reader.readAsText(file);
    };
}