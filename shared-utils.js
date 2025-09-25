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
 * Copies the content of a given container to the clipboard as rich text.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} feedbackElId - The ID of the feedback element.
 */
function handleCopyToClipboard(containerId, feedbackElId = 'feedback-message') {
    const container = document.getElementById(containerId);
    if (!container || !container.innerHTML.trim()) {
        showFeedback('No results to copy.', true, feedbackElId);
        return;
    }

    // Create a clean clone to manipulate
    const clone = container.cloneNode(true);

    // Prepare the clone for copying
    clone.querySelectorAll('.details-row').forEach(row => row.classList.add('is-visible'));
    clone.querySelectorAll('button').forEach(btn => btn.remove());
    clone.querySelectorAll('canvas').forEach(canvas => canvas.remove()); // Remove charts

    // Recursively apply inline styles for maximum Word compatibility
    const applyStyles = (element) => {
        const tagName = element.tagName.toLowerCase();
        element.style.fontFamily = "'Times New Roman', Times, serif";
        element.style.fontSize = '12pt';
        element.style.color = 'black';
        element.style.backgroundColor = 'transparent';
        element.style.border = 'none';

        switch (tagName) {
            case 'h2':
                element.style.fontSize = '14pt';
                element.style.fontWeight = 'bold';
                element.style.textAlign = 'center';
                element.style.borderBottom = '1px solid black';
                element.style.paddingBottom = '4px';
                element.style.marginBottom = '10px';
                break;
            case 'h3':
                element.style.fontSize = '13pt';
                element.style.fontWeight = 'bold';
                element.style.marginTop = '12px';
                break;
            case 'table':
                element.style.borderCollapse = 'collapse';
                element.style.width = '100%';
                element.style.marginTop = '10px';
                element.style.marginBottom = '10px';
                break;
            case 'th':
            case 'td':
                element.style.border = '1px solid black';
                element.style.padding = '4px 8px';
                element.style.textAlign = 'left';
                break;
            case 'caption':
                element.style.fontWeight = 'bold';
                element.style.textAlign = 'center';
                element.style.padding = '4px';
                break;
        }

        // Style for alert/note boxes
        if (element.classList.contains('bg-blue-100') || element.classList.contains('bg-yellow-100')) {
            element.style.border = '1px solid #dddddd';
            element.style.backgroundColor = '#f9f9f9';
            element.style.padding = '10px';
            element.style.marginTop = '10px';
            element.style.marginBottom = '10px';
        }

        // Recurse
        element.childNodes.forEach(child => { if (child.nodeType === 1) applyStyles(child); });
    };

    applyStyles(clone);

    const htmlBlob = new Blob([clone.innerHTML], { type: 'text/html' });
    navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob })]).then(() => {
        showFeedback('Report copied to clipboard!', false, feedbackElId);
    }).catch(err => {
        console.error('Failed to copy results: ', err);
        showFeedback('Copy failed. See console for details.', true, feedbackElId);
    });
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