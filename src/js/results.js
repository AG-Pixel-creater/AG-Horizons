// Wait for DOM content to be loaded
document.addEventListener("DOMContentLoaded", function() {
    // Get DOM elements
    const searchInput = document.getElementById("searchInput");
    const searchButton = document.getElementById("searchButton");
    const searchResults = document.getElementById("searchResults");
    const resultsLoader = document.getElementById('resultsLoader');
    // Add-site handling moved to upload.html / src/js/upload.js
    // Filter buttons
    const filterAllBtn = document.getElementById('filterAll');
    const filterWebsitesBtn = document.getElementById('filterWebsites');
    const filterImagesBtn = document.getElementById('filterImages');
    const filterVideosBtn = document.getElementById('filterVideos');

    // Get search query from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get("q");

    // State for last results and filters
    let lastResults = [];
    let currentFilter = 'all'; // 'all' | 'websites' | 'images' | 'videos'
    let lastQuery = '';
    // Token to identify the latest search; incremented each time a search starts
    let searchToken = 0;
    // Debounce timer id for input typing
    let debounceTimer = null;
    // Are we currently waiting for search results? used to avoid flashing 'No results' while loading
    let isSearching = false;

    // Debug UI — only enabled if URL has debug=1
    const DEBUG_SEARCH = (new URLSearchParams(window.location.search).get('debug') === '1');
    let debugPanel = null;
    function ensureDebugPanel() {
        if (!DEBUG_SEARCH) return;
        if (debugPanel) return debugPanel;
        debugPanel = document.createElement('div');
        debugPanel.style.position = 'fixed';
        debugPanel.style.left = '10px';
        debugPanel.style.bottom = '10px';
        debugPanel.style.zIndex = '20000';
        debugPanel.style.background = 'rgba(0,0,0,0.6)';
        debugPanel.style.color = 'white';
        debugPanel.style.padding = '8px 10px';
        debugPanel.style.fontSize = '12px';
        debugPanel.style.borderRadius = '8px';
        debugPanel.style.minWidth = '220px';
        debugPanel.innerText = 'Search debug panel';
        document.body.appendChild(debugPanel);
        return debugPanel;
    }
    function updateDebugPanel(){
        if (!DEBUG_SEARCH) return;
        ensureDebugPanel();
        debugPanel.innerText = `searchToken=${searchToken}\nlastQuery=${lastQuery}\nisSearching=${isSearching}\nlastResults=${lastResults.length}\ncurrentFilter=${currentFilter}`;
    }

    // Initialize with search query if present
    if (initialQuery) {
        if (searchInput) searchInput.value = initialQuery;
        performSearch(initialQuery);
    }

    // Wire filter buttons (if present)
    function setActiveFilter(filter) {
        currentFilter = filter;
        // UI active state
        filterAllBtn && filterAllBtn.classList.toggle('active', filter === 'all');
        filterWebsitesBtn && filterWebsitesBtn.classList.toggle('active', filter === 'websites');
        filterImagesBtn && filterImagesBtn.classList.toggle('active', filter === 'images');
        filterVideosBtn && filterVideosBtn.classList.toggle('active', filter === 'videos');
        updateDebugPanel();
        // Re-render using lastResults (if renderer present)
        if (typeof renderResults === 'function') {
            console.debug('setActiveFilter ->', filter, 'lastResults.length=', lastResults.length);
            renderResults(lastResults);
        } else {
            console.warn('renderResults not available yet; filter will apply after results load');
        }
    }
    // Note: attach filter button listeners after renderResults is defined further below.

    // Add event listeners
    if (searchButton) {
        searchButton.addEventListener("click", () => {
            if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
            performSearch(searchInput.value);
        });
    }
    
    if (searchInput) {
        // Debounced input search for fast interactive searching
        searchInput.addEventListener("input", (e) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            const q = (e.target.value || '').trim();
            if (!q) {
                if (searchResults) searchResults.innerHTML = `<p class="no-results">Please enter a search term</p>`;
                hideLoader();
                return;
            }
            // provide immediate feedback while typing
            showLoader();
            debounceTimer = setTimeout(() => performSearch(q), 350);
        });
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
                performSearch(searchInput.value);
            }
        });
    }

    // (Add-site code removed; use upload.html + src/js/upload.js instead)

    // Search function
    async function performSearch(query) {
        query = (query || "").trim().toLowerCase();
        // cancel any pending debounce
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }

        if (!query) {
            if (searchResults) {
                searchResults.innerHTML = `<p class="no-results">Please enter a search term</p>`;
            }
            return;
        }

        // create a token for this search; later results will be ignored if token changes
        const myToken = ++searchToken;
        console.debug('performSearch start', { query, token: myToken });
        lastQuery = query;

        try {
            // Update URL with search query
            const newUrl = `${window.location.pathname}?q=${encodeURIComponent(query)}`;
            window.history.pushState({ query }, "", newUrl);

            // Show loader and clear previous results
            showLoader();
            if (searchResults) searchResults.innerHTML = '';

            // Wait for Firebase initialization
            await window.connectionReady;

            // Get the Firestore instance
            const db = window.db;
            if (!db) {
                throw new Error("Firestore not initialized");
            }

            // Fetch all collections in parallel with reasonable limits
            const fetchPromises = APP_CONFIG.collections.map(collection =>
                db.collection(collection).limit(500).get()
                    .then(snapshot => ({ collection, snapshot }))
                    .catch(err => ({ collection, err }))
            );
            const snapshots = await Promise.all(fetchPromises);

            const results = [];
            for (const res of snapshots) {
                if (res.err) {
                    console.warn(`Error searching collection ${res.collection}:`, res.err);
                    continue;
                }
                const collection = res.collection;
                const snapshot = res.snapshot;

                snapshot.forEach(doc => {
                    const data = doc.data();

                    // Extract searchable fields (lowercased for matching)
                    const title = (data.title || data.website_title || "").toLowerCase();
                    const description = (data.description || data.website_description || "").toLowerCase();
                    const keywords = (data.website_keywords || data.keywords || []).map(k => (k || '').toLowerCase());

                    // Check if any field matches the query
                    if (title.includes(query) || description.includes(query) || keywords.some(k => k.includes(query))) {
                        // Normalize key output fields so rendering/filtering is easier
                        const outTitle = data.title || data.website_title || '';
                        const outDescription = data.description || data.website_description || '';
                        // Prefer explicit video/url fields when present
                        const outUrl = data.url || data.website_link || data.video_url || data.title_link || '';
                        // Company/site info (support multiple possible field names)
                        const outIsCompany = (typeof data.isCompany !== 'undefined') ? Boolean(data.isCompany) : false;
                        const outCompanyName = (data.companyName || data.company_name || data.company || data.businessName || data.business_name || '').trim();
                        const outSiteType = (data.siteType || data.site_type || data.site_type_name || data.website_type || data.type || '').trim();
                        // Normalize image/thumbnail URL (check multiple possible fields)
                        let outImage = data.imageUrl || data.website_image || data.image_url || data.thumbnail || '';
                        try {
                            if (typeof outImage === 'string' && outImage.indexOf('default-thumbnail.png') !== -1) {
                                outImage = '';
                            }
                            if (typeof outImage === 'string' && outImage && !/^https?:\/\//i.test(outImage) && !/^\/\//.test(outImage)) {
                                const trimmed = outImage.replace(/^\/+/, '');
                                outImage = `${window.location.origin}/${trimmed}`;
                            }
                        } catch (e) { outImage = ''; }

                        // Derive a type for easier filtering: website | image | video
                        let outType = 'website';
                        if (collection === 'images') {
                            outType = 'image';
                        } else if (collection === 'videos') {
                            outType = 'video';
                        } else if (collection === 'websites') {
                            outType = 'website';
                        } else {
                            if (data.video_url || data.videoUrl) outType = 'video';
                            else if (data.image_url || data.imageUrl || data.website_image || outImage) outType = 'image';
                            else outType = 'website';
                        }

                        results.push({ title: outTitle, description: outDescription, url: outUrl, imageUrl: outImage, isCompany: outIsCompany, companyName: outCompanyName, siteType: outSiteType, type: outType });
                    }
                });
            }

            console.debug('performSearch: computed results', results.length, { myToken, searchToken });
            // Update debug UI
            updateDebugPanel();
            // If another search has started in the meantime, drop these results
            if (myToken !== searchToken) {
                console.debug('Search result discarded (outdated token) for query', query, { myToken, searchToken });
                // hide loader so UI doesn't remain stuck
                hideLoader();
                updateDebugPanel();
                return;
            }
            lastResults = results;
            updateDebugPanel();
            // Update loader state before rendering so that renderResults can show results immediately
            hideLoader();
            renderResults(lastResults);
            updateDebugPanel();

        } catch (error) {
            console.error("Search error:", error);
            // Only update UI if this is the latest search token
            if (myToken === searchToken) {
                hideLoader();
                if (searchResults) {
                    searchResults.innerHTML = `
                        <p class="error">
                            An error occurred while searching. Please try again.
                        </p>
                    `;
                }
            }
        }
    
    }

    // Loader helpers
    function showLoader() {
        try {
            isSearching = true;
            if (resultsLoader) {
                resultsLoader.style.display = 'flex';
                resultsLoader.setAttribute('aria-hidden', 'false');
            }
        } catch (e) { /* ignore */ }
        updateDebugPanel();
    }
    function hideLoader() {
        try {
            isSearching = false;
            if (resultsLoader) {
                resultsLoader.style.display = 'none';
                resultsLoader.setAttribute('aria-hidden', 'true');
            }
        } catch (e) { /* ignore */ }
        updateDebugPanel();
    }

    // Render results with filter applied (moved outside performSearch so filters can call it)
    function renderResults(items) {
        if (!Array.isArray(items)) items = [];
        console.debug('renderResults start', { itemsLength: items.length, currentFilter, isSearching });

        const defaultImage = "https://via.placeholder.com/400x300?text=No+Image";

        // If no items and a search is in progress, do not display a 'No results' message yet — the loader is shown
        if (!items || items.length === 0) {
            if (isSearching) {
                // keep existing loader visible and avoid flashing a 'No results' placeholder
                console.debug('renderResults skip: no items and isSearching=true');
                return;
            }
            if (searchResults) searchResults.innerHTML = `<p class="no-results">No results found for your search</p>`;
            return;
        }

        // Special 'All' layout: Images (3x3 grid), then Videos, then Websites
        if (currentFilter === 'all') {
            const images = items.filter(i => i.type === 'image');
            const videos = items.filter(i => i.type === 'video');
            const websites = items.filter(i => i.type === 'website');

            let html = '';

            // Images section (limit to 9 for 3x3)
            if (images.length > 0) {
                html += `<h1 class="section-title">Images</h1>`;
                html += `<div class="images-grid">`;
                const imgCount = Math.min(9, images.length);
                for (let i = 0; i < imgCount; i++) {
                    const it = images[i];
                    const title = escapeHtml(it.title || 'Untitled');
                    const img = it.imageUrl || defaultImage;
                    const link = it.url || '#';
                    const desc = escapeHtml(it.description || '');
                    html += `
                        <div class="image-card">
                                    <img class="clickable-image" data-src="${img}" src="${img}" alt="${title}" onerror="this.src='${defaultImage}'" />
                            <div class="caption"><a href="${escapeHtml(link)}" target="_blank">${title}</a><p>${desc}</p></div>
                        </div>
                    `;
                }
                html += `</div>`;
            }

            // If there were no images at all and a search is still running, don't flash a 'No images' message
            if (images.length === 0 && isSearching) {
                console.debug('renderResults skip: images section empty and isSearching=true');
                return;
            }

            // Videos section
            if (videos.length > 0) {
                html += `<h2 class="section-title">Videos</h2>`;
                for (const v of videos) {
                    const title = escapeHtml(v.title || 'Untitled');
                    const description = escapeHtml(v.description || '');
                    const url = escapeHtml(v.url || '#');
                    const imageUrl = v.imageUrl || defaultImage;
                    html += `
                        <div class="result-item video">
                            <div class="image-container"><img class="clickable-image" data-src="${imageUrl}" src="${imageUrl}" alt="${title}" onerror="this.src='${defaultImage}'" /></div>
                            <div class="content"><h3>${title}</h3><p>${description}</p><a href="${url}" target="_blank">View Video</a></div>
                        </div>
                    `;
                }
            }

            // Websites section
            if (websites.length > 0) {
                html += `<h2 class="section-title">Websites</h2>`;
                for (const w of websites) {
                    const title = escapeHtml(w.title || 'Untitled');
                    const description = escapeHtml(w.description || '');
                    const url = escapeHtml(w.url || '#');
                    const imageUrl = w.imageUrl || defaultImage;
                    let metaHTML = '';
                    try {
                        if (w.companyName && w.companyName.trim()) {
                            const badge = w.isCompany ? 'Company' : 'Owner';
                            metaHTML = `<div class="result-meta"><span class="badge">${escapeHtml(badge)}</span><span class="company-name">${escapeHtml(w.companyName)}</span></div>`;
                        } else if (w.isCompany) {
                            metaHTML = `<div class="result-meta"><span class="badge">Company</span></div>`;
                        } else if (w.siteType && w.siteType.trim()) {
                            metaHTML = `<div class="result-meta"><span class="badge">${escapeHtml(w.siteType)}</span></div>`;
                        }
                    } catch(e) { metaHTML = ''; }

                    html += `
                        <div class="result-item website">
                            <div class="image-container"><img class="clickable-image" data-src="${imageUrl}" src="${imageUrl}" alt="${title}" onerror="this.src='${defaultImage}'" /></div>
                            <div class="content"><h3>${title}</h3>${metaHTML}<p>${description}</p><a href="${url}" target="_blank">Visit Site</a></div>
                        </div>
                    `;
                }
            }

            if (!html) html = `<p class="no-results">No results found for your search</p>`;
            if (searchResults) searchResults.innerHTML = html;
            return;
        }

        // If images filter is active, render the full images grid (not limited to 9)
        if (currentFilter === 'images') {
            const imagesOnly = items.filter(i => i.type === 'image');
            if (imagesOnly.length === 0) {
                if (isSearching) { console.debug('renderResults skip: images filter empty and isSearching=true'); return; }
                if (searchResults) searchResults.innerHTML = `<p class="no-results">No images found for your search</p>`;
                return;
            }
            let imgHtml = `<h1 class="section-title">Images</h1><div class="images-grid">`;
            for (const it of imagesOnly) {
                const title = escapeHtml(it.title || 'Untitled');
                const img = it.imageUrl || defaultImage;
                const link = escapeHtml(it.url || '#');
                const desc = escapeHtml(it.description || '');
                imgHtml += `
                    <div class="image-card">
                        <img class="clickable-image" data-src="${img}" src="${img}" alt="${title}" onerror="this.src='${defaultImage}'" />
                        <div class="caption"><a href="${link}" target="_blank">${title}</a><p>${desc}</p></div>
                    </div>
                `;
            }
            imgHtml += `</div>`;
            if (searchResults) searchResults.innerHTML = imgHtml;
            return;
        }

        // Non-'all' filters: keep previous behavior
        let filtered = items.slice();
        if (currentFilter === 'websites') {
            filtered = filtered.filter(i => i.type === 'website');
        } else if (currentFilter === 'images') {
            filtered = filtered.filter(i => i.type === 'image');
        } else if (currentFilter === 'videos') {
            filtered = filtered.filter(i => i.type === 'video');
        }

        console.debug('renderResults filtered.length=', filtered.length);

        if (filtered.length === 0) {
            if (isSearching) { console.debug('renderResults skip: filtered empty and isSearching=true'); return; }
            if (searchResults) searchResults.innerHTML = `<p class="no-results">No results found for filter</p>`;
            return;
        }

        let resultsHTML = '';
        filtered.forEach(item => {
            const title = item.title || 'Untitled';
            const description = item.description || '';
            const url = item.url || '#';
            const imageUrl = item.imageUrl || defaultImage;

            // determine action label based on type
            let actionLabel = 'Visit Site';
            if (item.type === 'video') actionLabel = 'View Video';
            else if (item.type === 'image') actionLabel = 'View Image';

            // Build metadata HTML: show companyName if present (regardless of isCompany), otherwise show siteType
            let metaHTML = '';
            try {
                console.debug('Result metadata:', { isCompany: item.isCompany, companyName: item.companyName, siteType: item.siteType });
                if (item.companyName && item.companyName.trim()) {
                    const badge = item.isCompany ? 'Company' : 'Owner';
                    metaHTML = `<div class="result-meta"><span class="badge">${escapeHtml(badge)}</span><span class="company-name">${escapeHtml(item.companyName)}</span></div>`;
                } else if (item.isCompany) {
                    metaHTML = `<div class="result-meta"><span class="badge">Company</span></div>`;
                } else if (item.siteType && item.siteType.trim()) {
                    metaHTML = `<div class="result-meta"><span class="badge">${escapeHtml(item.siteType)}</span></div>`;
                }
            } catch (e) { metaHTML = ''; }

            resultsHTML += `
                <div class="result-item ${item.type || ''}">
                    <div class="image-container">
                        <img class="clickable-image" data-src="${imageUrl}" src="${imageUrl}" alt="${escapeHtml(title)}" onerror="this.src='${defaultImage}'" />
                    </div>
                    <div class="content">
                        <h3>${escapeHtml(title)}</h3>
                        ${metaHTML}
                        <p>${escapeHtml(description)}</p>
                        <a href="${escapeHtml(url)}" target="_blank">${escapeHtml(actionLabel)}</a>
                    </div>
                </div>
            `;
        });

        if (searchResults) searchResults.innerHTML = resultsHTML;
    }

    // small HTML escaper to avoid accidental markup injection from data
    function escapeHtml(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Image overlay / gallery implementation with navigation
    (function(){
        let overlay = null;
        let images = []; // { src, alt, title, link, desc }
        let currentIndex = 0;

        function createOverlay(){
            if (overlay) return overlay;
            overlay = document.createElement('div');
            overlay.className = 'image-overlay';
            overlay.style.display = 'none';
            overlay.innerHTML = `
                <div class="image-overlay-inner">
                    <button class="image-overlay-close" aria-label="Close">✕</button>
                    <div class="overlay-meta">
                        <div class="meta-sub"></div>
                        <div class="meta-header"><h2 class="meta-title"></h2><a class="meta-visit" target="_blank">Visit</a></div>
                        <p class="meta-desc"></p>
                    </div>
                    <div class="overlay-image-wrap">
                        <button class="overlay-nav prev" aria-label="Previous">❮</button>
                        <img class="image-overlay-img" src="" alt="" />
                        <button class="overlay-nav next" aria-label="Next">❯</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            // Close and nav handlers
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target.classList.contains('image-overlay-close')) closeOverlay();
            });
            overlay.querySelector('.overlay-nav.prev').addEventListener('click', (e)=>{ e.stopPropagation(); showPrev(); });
            overlay.querySelector('.overlay-nav.next').addEventListener('click', (e)=>{ e.stopPropagation(); showNext(); });
            overlay.querySelector('.meta-visit').addEventListener('click', (e)=>{ /* allow default */ });

            document.addEventListener('keydown', (e) => {
                if (!overlay || overlay.style.display === 'none') return;
                if (e.key === 'Escape') closeOverlay();
                else if (e.key === 'ArrowLeft') showPrev();
                else if (e.key === 'ArrowRight') showNext();
            });

            return overlay;
        }

        function updateDisplay(){
            if (!overlay) return;
            const o = overlay;
            const metaSub = o.querySelector('.meta-sub');
            const metaTitle = o.querySelector('.meta-title');
            const metaDesc = o.querySelector('.meta-desc');
            const metaVisit = o.querySelector('.meta-visit');
            const img = o.querySelector('.image-overlay-img');
            const prevBtn = o.querySelector('.overlay-nav.prev');
            const nextBtn = o.querySelector('.overlay-nav.next');

            const item = images[currentIndex] || {};
            img.src = item.src || '';
            img.alt = item.alt || '';
            metaSub.textContent = item.company || item.siteType || '';
            metaSub.style.display = metaSub.textContent ? 'block' : 'none';
            metaTitle.textContent = item.title || '';
            metaDesc.textContent = item.desc || '';
            if (item.link) { metaVisit.href = item.link; metaVisit.style.display = 'inline-block'; } else { metaVisit.style.display = 'none'; }

            prevBtn.disabled = currentIndex <= 0;
            nextBtn.disabled = currentIndex >= images.length - 1;
        }

        function openOverlayByIndex(idx){
            if (!images || images.length === 0) return;
            currentIndex = Math.max(0, Math.min(idx, images.length - 1));
            createOverlay();
            updateDisplay();
            // prevent background scrolling while open
            document.body.style.overflow = 'hidden';
            overlay.style.display = 'flex';
            setTimeout(()=> overlay.classList.add('visible'), 10);
        }

        function closeOverlay(){
            if (!overlay) return;
            overlay.classList.remove('visible');
            document.body.style.overflow = '';
            setTimeout(()=> { if (overlay) overlay.style.display = 'none'; }, 200);
        }

        function showPrev(){
            if (currentIndex > 0) { currentIndex--; updateDisplay(); }
        }
        function showNext(){
            if (currentIndex < images.length - 1) { currentIndex++; updateDisplay(); }
        }

        // Rebuild the image list from current DOM (.clickable-image elements)
        function rebuildImageList(){
            images = [];
            const imgEls = Array.from(document.querySelectorAll('.clickable-image'));
            imgEls.forEach((el, i) => {
                el.dataset.idx = String(i);
                // find nearby title/desc/link in the card
                let title = el.getAttribute('alt') || '';
                let desc = '';
                let link = '';
                let company = '';
                let siteType = '';
                try {
                    const card = el.closest('.image-card') || el.closest('.result-item');
                    if (card) {
                        const a = card.querySelector('a');
                        if (a) link = a.href;
                        const t = card.querySelector('h3') || card.querySelector('.caption a');
                        if (t) title = t.textContent.trim();
                        const p = card.querySelector('p');
                        if (p) desc = p.textContent.trim();
                        const companyEl = card.querySelector('.result-meta .company-name');
                        if (companyEl) company = companyEl.textContent.trim();
                        const badgeEl = card.querySelector('.result-meta .badge');
                        if (badgeEl) {
                            const btxt = badgeEl.textContent.trim();
                            // if badge is a generic Company/Owner label, prefer company name instead
                            if (btxt && btxt.toLowerCase() !== 'company' && btxt.toLowerCase() !== 'owner') siteType = btxt;
                            else if (!company && btxt && (btxt.toLowerCase() === 'company' || btxt.toLowerCase() === 'owner')) siteType = '';
                        }
                    }
                } catch (e) { /* ignore */ }
                images.push({ src: el.dataset.src || el.src, alt: el.alt || '', title, desc, link, company, siteType });
            });
        }

        // Delegated click handler on results container
        if (searchResults) {
            searchResults.addEventListener('click', (e) => {
                const img = e.target && e.target.classList && e.target.classList.contains('clickable-image') ? e.target : null;
                if (img && img.dataset && (img.dataset.src || img.src)) {
                    e.preventDefault();
                    rebuildImageList();
                    const idx = Number(img.dataset.idx || -1);
                    openOverlayByIndex(idx >= 0 ? idx : images.findIndex(i => i.src === (img.dataset.src || img.src)) || 0);
                }
            });
        }

        // Rebuild images when results change (mutation observer)
        const ro = new MutationObserver(() => rebuildImageList());
        if (searchResults) ro.observe(searchResults, { childList: true, subtree: true });

    })();

    // Now attach filter button listeners (ensure renderResults is present)
    filterAllBtn && filterAllBtn.addEventListener('click', () => setActiveFilter('all'));
    filterWebsitesBtn && filterWebsitesBtn.addEventListener('click', () => setActiveFilter('websites'));
    filterImagesBtn && filterImagesBtn.addEventListener('click', () => setActiveFilter('images'));
    filterVideosBtn && filterVideosBtn.addEventListener('click', () => setActiveFilter('videos'));

    // Ensure UI reflects initial filter state
    setActiveFilter(currentFilter);

});
