/**
 * Injects a shared header and navigation template into the page.
 * This reduces HTML duplication across multiple calculator pages.
 *
 * @param {object} options - Configuration for the header.
 * @param {string} options.activePage - The key for the currently active page (e.g., 'wind', 'snow').
 * @param {string} options.pageTitle - The main title to display in the H1 tag.
 * @param {string} options.headerPlaceholderId - The ID of the element where the header will be injected.
 */
function injectHeader(options) {
    const { activePage, pageTitle, headerPlaceholderId } = options;
    const placeholder = document.getElementById(headerPlaceholderId);

    if (!placeholder) {
        console.error(`Header placeholder with ID "${headerPlaceholderId}" not found.`);
        return;
    }

    // Define all navigation links in one place
    const navLinks = {
        asce: [
            { key: 'wind', href: 'wind.html', text: 'Wind Load' },
            { key: 'snow', href: 'snow.html', text: 'Snow Load' },
            { key: 'rain', href: 'rain.html', text: 'Rain Load' },
            { key: 'combos', href: 'combos.html', text: 'Load Combos' }
        ],
        aisc: [
            { key: 'steel-check', href: 'STEEL CHECK.HTML', text: 'Section Check' },
            { key: 'base-plate', href: 'Base Plate.html', text: 'Base Plate' },
            { key: 'splice', href: 'SPLICE.HTML', text: 'Splice' }
        ],
        wood: [
            { key: 'wood-design', href: 'NDS Wood Design.html', text: 'Member Design' }
        ],
        nbr: [
            { key: 'nbr-combos', href: 'Comb NBR 6118.html', text: 'Combinações' }
        ]
    };

    // Determine which set of nav links to use based on the active page key
    const currentNavSetKey = Object.keys(navLinks).find(key => navLinks[key].some(link => link.key === activePage));
    const currentNavLinks = navLinks[currentNavSetKey] || [];

    const navHtml = currentNavLinks.map(link => `
        <a href="${link.href}" class="px-4 py-2 text-sm font-medium rounded-md z-10 transition-colors ${link.key === activePage ? 'toggle-active' : 'toggle-inactive'}">
            ${link.text}
        </a>
    `).join('');

    const headerHtml = `
        <header class="text-center mb-8 relative">
            <div class="flex justify-center mb-4 flex-wrap">
                <div class="relative inline-flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    ${navHtml}
                </div>
            </div>
            <h1 id="main-title" class="text-3xl md:text-4xl font-bold">${pageTitle}</h1>
            <button id="theme-toggle" type="button" class="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 absolute top-0 right-0">
                <svg id="theme-toggle-dark-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                <svg id="theme-toggle-light-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 5.05A1 1 0 003.636 6.464l.707.707a1 1 0 001.414-1.414l-.707-.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" fill-rule="evenodd" clip-rule="evenodd"></path></svg>
            </button>
        </header>
    `;

    placeholder.innerHTML = headerHtml;
}

/**
 * Injects a shared footer template into the page.
 * @param {object} options - Configuration for the footer.
 * @param {string} options.footerPlaceholderId - The ID of the element where the footer will be injected.
 */
function injectFooter(options) {
    const { footerPlaceholderId } = options;
    const placeholder = document.getElementById(footerPlaceholderId);

    if (!placeholder) {
        console.error(`Footer placeholder with ID "${footerPlaceholderId}" not found.`);
        return;
    }

    const footerHtml = `
        <footer class="text-center mt-12 py-6 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 print-hidden">
            <p>&copy; ${new Date().getFullYear()} Engineering Calculators. All Rights Reserved.</p>
            <p class="text-xs mt-2">
                Disclaimer: These tools are for preliminary design and educational purposes only. Always verify results with a licensed professional engineer and the latest code standards.
            </p>
        </footer>
        
        <!-- Back to Top Button -->
        <button id="back-to-top-btn" title="Go to top" class="opacity-0 invisible fixed bottom-5 right-5 z-50 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-opacity duration-300 print-hidden">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>
        </button>
    `;

    placeholder.innerHTML = footerHtml;
}