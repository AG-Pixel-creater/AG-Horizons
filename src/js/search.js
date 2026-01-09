(function () {
    // Get DOM elements
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');

    // Add event listeners
    searchButton && searchButton.addEventListener('click', handleSearch);
    searchInput && searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    // Handle search function
    async function handleSearch() {
    const query = (searchInput && searchInput.value || '').trim();
    if (!query) {
        alert('Please enter a search term');
        return;
    }

    // Disable search button to prevent double submission
    if (searchButton) {
        searchButton.disabled = true;
        searchButton.textContent = 'Connecting...';
    }
    
    try {
        // Wait for Firebase connection to be ready
        await window.connectionReady;
        
        // Check if Firestore is available and connected
        if (!window.db && !window.dbMod) {
            throw new Error('Database connection not initialized');
        }

        if (!window.isFirestoreConnected) {
            throw new Error('Database connection lost');
        }
        
        // If connection is successful, redirect to results page
        if (searchButton) searchButton.textContent = 'Redirecting...';
        window.location.href = `results.html?q=${encodeURIComponent(query)}`;
    } catch (error) {
        console.error('Search error:', error);
        
        // Show user-friendly error message
        let errorMessage;
        if (error.code === 'permission-denied') {
            errorMessage = 'Unable to access the search database. Please check Firebase configuration and rules.';
        } else if (error.code === 'unavailable' || error.message === 'Database connection lost') {
            errorMessage = 'Unable to connect to the search service. Please check your internet connection.';
        } else if (error.message && error.message.includes('Firebase configuration')) {
            errorMessage = 'Invalid Firebase configuration. Please update your settings.';
        } else {
            errorMessage = 'An error occurred while attempting to search. Please try again later.';
        }
        alert(errorMessage);
        
        // Reset button state
        if (searchButton) {
            searchButton.disabled = false;
            searchButton.textContent = 'Search';
        }
    }
    }
})();
