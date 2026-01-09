(function () {
  // Generic upload handler that supports two known form variants used in this project:
  // - form id="uploadForm" (legacy)
  // - form id="websiteForm" (upload.html)

  const messageDiv = document.getElementById('message');

  function showMessage(text, type = 'info') {
    if (!messageDiv) return;
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    if (type === 'success') setTimeout(() => { messageDiv.textContent = ''; messageDiv.className = 'message'; }, 5000);
  }

  async function ensureConnectionReady() {
    if (window.connectionReady) {
      try { await window.connectionReady; } catch (e) { /* swallow - caller will handle */ }
    }
  }

  // Validate that a URL points to an image. Try HEAD request first, then fallback.
  async function validateImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const ct = res.headers.get('content-type') || '';
      if (ct.startsWith('image/')) return true;
    } catch (e) {
      // ignore and try fallback
    }

    // Fallback: try to load as Image
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      // add cache-buster to avoid some servers blocking HEAD/XHR
      img.src = url + (url.includes('?') ? '&' : '?') + 'cachebust=' + Date.now();
      // timeout
      setTimeout(() => resolve(false), 5000);
    });
  }

  // Return a set of likely favicon candidate URLs for a given site URL
  function getFaviconCandidates(siteUrl) {
    try {
      const u = new URL(siteUrl);
      const origin = u.origin;
      // Common variants plus Google's favicon service as fallback
      return [
        origin + '/favicon.ico',
        origin + '/favicon.png',
        origin + '/favicon.svg',
        'https://www.google.com/s2/favicons?sz=64&domain_url=' + encodeURIComponent(siteUrl)
      ];
    } catch (e) {
      // If parsing fails, still try the google service
      return ['https://www.google.com/s2/favicons?sz=64&domain_url=' + encodeURIComponent(siteUrl)];
    }
  }

  // Try candidate favicon URLs and return the first valid one (or null)
  async function findFaviconForSite(siteUrl) {
    if (!siteUrl) return null;
    const candidates = getFaviconCandidates(siteUrl);
    for (const c of candidates) {
      try {
        const ok = await validateImageUrl(c);
        if (ok) return c;
      } catch (e) {
        // ignore and try next
      }
    }
    return null;
  }

  // Simple client-side content blocking (not a replacement for server-side moderation)
  const BLOCKED_KEYWORDS = ['porn','pornhub','xvideos','xhamster','xnxx','redtube','youporn','adult','xxx','escort','cam','hentai','nsfw','pornography','nude','erotic','sex'];
  const BLOCKED_DOMAINS = ['pornhub.com','xvideos.com','xhamster.com','xnxx.com','redtube.com','youporn.com','porn.com'];

  function containsBlockedKeyword(text) {
    if (!text) return false;
    try { const s = String(text).toLowerCase(); return BLOCKED_KEYWORDS.some(k => s.includes(k)); } catch (e) { return false; }
  }
  function getHostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return null; }
  }
  function isBlockedSubmission({title, link, description, keywords}) {
    if (link) {
      const h = getHostname(link);
      if (h) {
        if (BLOCKED_DOMAINS.some(d => h === d || h.endsWith('.' + d))) return 'blocked domain: ' + h;
        if (containsBlockedKeyword(h)) return 'blocked domain keyword: ' + h;
      }
    }
    if (title && containsBlockedKeyword(title)) return 'title contains disallowed content';
    if (description && containsBlockedKeyword(description)) return 'description contains disallowed content';
    if (keywords && containsBlockedKeyword(keywords)) return 'keywords contain disallowed content';
    return false;
  }

  // Handler for the modern upload.html form (websiteForm)
  const websiteForm = document.getElementById('websiteForm');
  if (websiteForm) {
  // image URL preview for websiteForm
  const imageUrlInput = document.getElementById('image_url');
  const imagePreview = document.getElementById('imagePreview');
  // company/site type elements (optional)
  const isCompanyCheckbox = document.getElementById('isCompanyCheckbox');
  const companyNameWrap = document.getElementById('companyNameWrap');
  const companyNameInput = document.getElementById('company_name');
  const siteTypeSelect = document.getElementById('site_type');
    if (imageUrlInput && imagePreview) {
      async function showImageFromUrl(v) {
        imagePreview.innerHTML = '';
        if (!v) return;
        const ok = await validateImageUrl(v);
        if (ok) {
          const img = document.createElement('img');
          img.src = v;
          img.style.maxWidth = '100%';
          img.style.maxHeight = '180px';
          imagePreview.appendChild(img);
        } else {
          imagePreview.textContent = 'Invalid image URL';
        }
      }

      imageUrlInput.addEventListener('input', async () => {
        const v = (imageUrlInput.value || '').trim();
        await showImageFromUrl(v);
      });

      // Preview button: prefer explicit image_url, otherwise try site favicon
      const previewBtn = document.getElementById('previewImageButton');
      if (previewBtn) {
        previewBtn.addEventListener('click', async () => {
          const explicit = (imageUrlInput.value || '').trim();
          if (explicit) {
            await showImageFromUrl(explicit);
            return;
          }
          const siteLinkEl = document.getElementById('website_link');
          const siteLink = siteLinkEl ? (siteLinkEl.value || '').trim() : '';
          if (!siteLink) {
            imagePreview.textContent = 'Enter an image URL or website link to preview.';
            return;
          }
          imagePreview.textContent = 'Searching for site favicon...';
          const fav = await findFaviconForSite(siteLink);
          if (fav) {
            await showImageFromUrl(fav);
            // populate image_url so submission will use it (user can still change)
            imageUrlInput.value = fav;
          } else {
            imagePreview.textContent = 'No favicon found for site.';
          }
        });
      }

      // If user types a website link and no explicit image URL provided, attempt to show favicon
      const siteLinkEl = document.getElementById('website_link');
      if (siteLinkEl) {
        let delayTimer = null;
        siteLinkEl.addEventListener('input', () => {
          if (imageUrlInput.value && imageUrlInput.value.trim()) return; // don't override explicit
          if (delayTimer) clearTimeout(delayTimer);
          delayTimer = setTimeout(async () => {
            const siteLink = (siteLinkEl.value || '').trim();
            if (!siteLink) return;
            imagePreview.textContent = 'Searching for site favicon...';
            const fav = await findFaviconForSite(siteLink);
            if (fav) {
              await showImageFromUrl(fav);
              // do not auto-populate the input; leave it as suggestion
            }
          }, 600);
        });
      }
    }
    // show/hide company name field when checkbox toggled
    if (isCompanyCheckbox && companyNameWrap) {
      isCompanyCheckbox.addEventListener('change', () => {
        if (isCompanyCheckbox.checked) {
          companyNameWrap.style.display = 'block';
        } else {
          companyNameWrap.style.display = 'none';
          if (companyNameInput) companyNameInput.value = '';
        }
      });
    }
    websiteForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = this.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : 'Adding...';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Adding...'; }

      try {
        await ensureConnectionReady();

        const website_title = document.getElementById('website_title').value.trim();
        const website_link = document.getElementById('website_link').value.trim();
        const website_keywords = document.getElementById('website_keywords').value.trim();
        const website_description = document.getElementById('website_description').value.trim();
        const fileInput = document.getElementById('upload_image');

        if (!website_title || !website_link || !website_keywords || !website_description) {
          showMessage('Please fill in all required fields.', 'error');
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
          return;
        }

        // Client-side moderation check
        const blockReason = isBlockedSubmission({ title: website_title, link: website_link, description: website_description, keywords: website_keywords });
        if (blockReason) {
          showMessage('Submission blocked: ' + blockReason, 'error');
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
          return;
        }

        let imageUrl = null;
        // Prefer a provided image URL over uploading a file
        const providedImageUrl = document.getElementById('image_url') && document.getElementById('image_url').value.trim();
        if (providedImageUrl) {
          showMessage('Validating image URL...', 'info');
          const ok = await validateImageUrl(providedImageUrl);
          if (!ok) throw new Error('Provided image URL is not valid or not reachable');
          imageUrl = providedImageUrl;
          showMessage('Using provided image URL', 'success');
        } else if (fileInput && fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          const fileName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          showMessage('Uploading image...', 'info');

          if (!window.storage) {
            throw new Error('Firebase Storage is not initialized (window.storage missing)');
          }

          // compat storage usage
          const storageRef = window.storage.ref('website_images/' + fileName);
          const snapshot = await storageRef.put(file);
          imageUrl = await snapshot.ref.getDownloadURL();
          showMessage('Image uploaded', 'success');
        }

        // If no image was provided or uploaded, try to derive a favicon from the provided site link
        if (!imageUrl) {
          showMessage('Attempting to fetch site favicon...', 'info');
          const foundFavicon = await findFaviconForSite(website_link);
          if (foundFavicon) {
            imageUrl = foundFavicon;
            showMessage('Using site favicon as image', 'success');
          }
        }

        const keywordsArray = website_keywords.split(',').map(kw => kw.trim()).filter(k => k.length);

        // company/siteType fields (optional)
        const isCompany = !!(isCompanyCheckbox && isCompanyCheckbox.checked);
        const companyName = isCompany && companyNameInput ? (companyNameInput.value || '').trim() : '';
        const siteType = (!isCompany && siteTypeSelect) ? (siteTypeSelect.value || '').trim() : '';

        const websiteData = {
          website_title,
          website_link,
          website_keywords: keywordsArray,
          website_description,
          website_image: imageUrl || null,
          isCompany: Boolean(isCompany),
          companyName: companyName || '',
          siteType: siteType || '',
          created_at: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) ?
            window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
        };

        if (!window.db) throw new Error('Firestore (compat) not available (window.db missing)');

        await window.db.collection('websites').add(websiteData);

        showMessage('Website added successfully!', 'success');
        websiteForm.reset();
  if (imagePreview) imagePreview.innerHTML = '';

      } catch (err) {
        console.error('Upload error:', err);
        showMessage('Error adding website: ' + (err && err.message || err), 'error');
      } finally {
        if (submitBtn) { submitBtn.textContent = originalText; submitBtn.disabled = false; }
      }
    });
  }

  // Panel switching (sidebar) - now supports site, image, and video panels
  const uploadSiteBtn = document.getElementById('uploadSiteBtn');
  const uploadImageBtn = document.getElementById('uploadImageBtn');
  const uploadVideoBtn = document.getElementById('uploadVideoBtn');
  const websitePanel = document.getElementById('websitePanel');
  const imagePanel = document.getElementById('imagePanel');
  const videoPanel = document.getElementById('videoPanel');
  function showPanel(panel) {
    websitePanel.classList.toggle('hidden', panel !== 'site');
    imagePanel.classList.toggle('hidden', panel !== 'image');
    if (videoPanel) videoPanel.classList.toggle('hidden', panel !== 'video');

    uploadSiteBtn.classList.toggle('active', panel === 'site');
    uploadImageBtn.classList.toggle('active', panel === 'image');
    if (uploadVideoBtn) uploadVideoBtn.classList.toggle('active', panel === 'video');
  }
  if (uploadSiteBtn && uploadImageBtn) {
    uploadSiteBtn.addEventListener('click', () => showPanel('site'));
    uploadImageBtn.addEventListener('click', () => showPanel('image'));
    if (uploadVideoBtn) uploadVideoBtn.addEventListener('click', () => showPanel('video'));
  }

  // Image form handling (imagePanel)
  const imageForm = document.getElementById('imageForm');
  if (imageForm) {
    const imageUrlInputImg = document.getElementById('image_url_img');
    const imageFileInput = document.getElementById('image_file_img');
    const imagePreviewImg = document.getElementById('imagePreviewImg');
    const previewBtnImg = document.getElementById('previewImageButtonImg');
    const titleInput = document.getElementById('image_title');
    const titleLinkInput = document.getElementById('image_title_link');
    const descInput = document.getElementById('image_description');
    const imageCardPreview = document.getElementById('imageCardPreview');

    async function showImgFromUrl(v) {
      imagePreviewImg.innerHTML = '';
      if (!v) return;
      const ok = await validateImageUrl(v);
      if (ok) {
        const img = document.createElement('img');
        img.src = v;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '220px';
        imagePreviewImg.appendChild(img);

        // also update card preview
        if (imageCardPreview) {
          imageCardPreview.innerHTML = '';
          const cardImg = document.createElement('img');
          cardImg.src = v;
          imageCardPreview.appendChild(cardImg);
          const a = document.createElement('a');
          a.href = titleLinkInput && titleLinkInput.value ? titleLinkInput.value : '#';
          a.textContent = titleInput && titleInput.value ? titleInput.value : 'Title';
          imageCardPreview.appendChild(a);
          const p = document.createElement('p');
          p.textContent = descInput && descInput.value ? descInput.value : '';
          imageCardPreview.appendChild(p);
        }
      } else {
        imagePreviewImg.textContent = 'Invalid image URL';
      }
    }

    if (imageUrlInputImg && imagePreviewImg) {
      imageUrlInputImg.addEventListener('input', async () => {
        const v = (imageUrlInputImg.value || '').trim();
        await showImgFromUrl(v);
      });
    }

    if (previewBtnImg) {
      previewBtnImg.addEventListener('click', async () => {
        const explicit = (imageUrlInputImg.value || '').trim();
        if (explicit) { await showImgFromUrl(explicit); return; }
        const siteLink = (titleLinkInput && titleLinkInput.value || '').trim();
        if (!siteLink) { imagePreviewImg.textContent = 'Enter an image URL or title link to preview.'; return; }
        imagePreviewImg.textContent = 'Searching for site favicon...';
        const fav = await findFaviconForSite(siteLink);
        if (fav) {
          imageUrlInputImg.value = fav;
          await showImgFromUrl(fav);
        } else {
          imagePreviewImg.textContent = 'No favicon found for site.';
        }
      });
    }

    if (titleLinkInput) {
      let tTimer = null;
      titleLinkInput.addEventListener('input', () => {
        if (imageUrlInputImg && imageUrlInputImg.value && imageUrlInputImg.value.trim()) return;
        if (tTimer) clearTimeout(tTimer);
        tTimer = setTimeout(async () => {
          const site = (titleLinkInput.value || '').trim();
          if (!site) return;
          imagePreviewImg.textContent = 'Searching for site favicon...';
          const fav = await findFaviconForSite(site);
          if (fav) await showImgFromUrl(fav);
        }, 600);
      });
    }

    imageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = imageForm.querySelector('button[type="submit"]');
      const orig = submitBtn ? submitBtn.textContent : 'Adding...';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Adding...'; }
      try {
        await ensureConnectionReady();
        // Client-side moderation check
        const blockReason = isBlockedSubmission({
          title: titleInput && titleInput.value ? titleInput.value.trim() : '',
          link: titleLinkInput && titleLinkInput.value ? titleLinkInput.value.trim() : '',
          description: descInput && descInput.value ? descInput.value.trim() : '',
          keywords: ''
        });
        if (blockReason) {
          showMessage('Submission blocked: ' + blockReason, 'error');
          if (submitBtn) { submitBtn.textContent = orig; submitBtn.disabled = false; }
          return;
        }

        let imageUrl = null;
        const provided = imageUrlInputImg && imageUrlInputImg.value.trim();
        if (provided) {
          const ok = await validateImageUrl(provided);
          if (!ok) throw new Error('Provided image URL is not valid');
          imageUrl = provided;
        } else if (imageFileInput && imageFileInput.files && imageFileInput.files[0]) {
          if (!window.storage) throw new Error('Firebase Storage not initialized');
          const file = imageFileInput.files[0];
          const fileName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const storageRef = window.storage.ref('image_posts/' + fileName);
          const snapshot = await storageRef.put(file);
          imageUrl = await snapshot.ref.getDownloadURL();
        }

        // try favicon as last resort (if title link provided)
        if (!imageUrl) {
          const link = (titleLinkInput && titleLinkInput.value || '').trim();
          if (link) {
            const fav = await findFaviconForSite(link);
            if (fav) imageUrl = fav;
          }
        }

        // Block image URLs that match blocked domains or keywords
        if (imageUrl && (containsBlockedKeyword(imageUrl) || (getHostname(imageUrl) && BLOCKED_DOMAINS.some(d => getHostname(imageUrl).endsWith(d))))) {
          throw new Error('Image URL blocked due to disallowed content');
        }

        if (!imageUrl) throw new Error('No valid image provided');

        const doc = {
          image_url: imageUrl,
          title: titleInput && titleInput.value ? titleInput.value.trim() : '',
          title_link: titleLinkInput && titleLinkInput.value ? titleLinkInput.value.trim() : '',
          description: descInput && descInput.value ? descInput.value.trim() : '',
          created_at: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) ?
            window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
        };

        const dbRef = window.db || window.dbMod;
        if (!dbRef || typeof dbRef.collection !== 'function') throw new Error('No Firestore instance available');
        await dbRef.collection('images').add(doc);

        showMessage('Image added successfully!', 'success');
        imageForm.reset();
        if (imagePreviewImg) imagePreviewImg.innerHTML = '';
        if (imageCardPreview) imageCardPreview.innerHTML = '';

      } catch (err) {
        console.error('Image upload error:', err);
        showMessage('Error adding image: ' + (err && err.message || err), 'error');
      } finally {
        if (submitBtn) { submitBtn.textContent = orig; submitBtn.disabled = false; }
      }
    });
  }

  // Video form handling (videoPanel)
  const videoForm = document.getElementById('videoForm');
  if (videoForm) {
    const videoUrlInput = document.getElementById('video_url');
    const videoFileInput = document.getElementById('video_file');
    const videoPreview = document.getElementById('videoPreview');
    const previewVideoButton = document.getElementById('previewVideoButton');
    const videoTitleInput = document.getElementById('video_title');
    const videoTitleLinkInput = document.getElementById('video_title_link');
    const videoDescInput = document.getElementById('video_description');
    const videoCardPreview = document.getElementById('videoCardPreview');

    function extractYouTubeId(url) {
      try {
        const u = new URL(url);
        if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
        if (u.hostname === 'youtu.be') return u.pathname.slice(1);
      } catch (e) { }
      return null;
    }

    async function showVideoFromUrl(v) {
      if (!videoPreview) return false;
      videoPreview.innerHTML = '';
      if (!v) return false;
      const yid = extractYouTubeId(v);
      if (yid) {
        const iframe = document.createElement('iframe');
        iframe.width = 320; iframe.height = 180; iframe.src = 'https://www.youtube.com/embed/' + yid; iframe.frameBorder = 0;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'; iframe.allowFullscreen = true;
        videoPreview.appendChild(iframe);
        if (videoCardPreview) {
          videoCardPreview.innerHTML = '';
          const thumbnail = 'https://img.youtube.com/vi/' + yid + '/hqdefault.jpg';
          const img = document.createElement('img'); img.src = thumbnail; videoCardPreview.appendChild(img);
          const a = document.createElement('a'); a.href = videoTitleLinkInput && videoTitleLinkInput.value ? videoTitleLinkInput.value : '#'; a.textContent = videoTitleInput && videoTitleInput.value ? videoTitleInput.value : 'Title'; videoCardPreview.appendChild(a);
          const p = document.createElement('p'); p.textContent = videoDescInput && videoDescInput.value ? videoDescInput.value : ''; videoCardPreview.appendChild(p);
        }
        return true;
      }

      return new Promise((resolve) => {
        const vid = document.createElement('video'); vid.controls = true; vid.style.maxWidth = '100%'; vid.style.maxHeight = '240px'; vid.src = v;
        vid.onloadedmetadata = () => { if (videoPreview) videoPreview.appendChild(vid); if (videoCardPreview) { videoCardPreview.innerHTML = ''; videoCardPreview.appendChild(vid); const a = document.createElement('a'); a.href = videoTitleLinkInput && videoTitleLinkInput.value ? videoTitleLinkInput.value : '#'; a.textContent = videoTitleInput && videoTitleInput.value ? videoTitleInput.value : 'Title'; videoCardPreview.appendChild(a); const p = document.createElement('p'); p.textContent = videoDescInput && videoDescInput.value ? videoDescInput.value : ''; videoCardPreview.appendChild(p); } resolve(true); };
        vid.onerror = () => { if (videoPreview) videoPreview.textContent = 'Cannot preview video URL'; resolve(false); };
        setTimeout(() => resolve(false), 8000);
      });
    }

    if (previewVideoButton) previewVideoButton.addEventListener('click', async () => {
      const explicit = (videoUrlInput && videoUrlInput.value || '').trim();
      if (explicit) { await showVideoFromUrl(explicit); return; }
      const link = (videoTitleLinkInput && videoTitleLinkInput.value || '').trim();
      if (!link) { if (videoPreview) videoPreview.textContent = 'Enter a video URL or title link to preview.'; return; }
      await showVideoFromUrl(link);
    });

    videoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = videoForm.querySelector('button[type="submit"]');
      const orig = submitBtn ? submitBtn.textContent : 'Adding...';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Adding...'; }
      try {
        await ensureConnectionReady();

        // moderation check
        const blockReason = isBlockedSubmission({ title: videoTitleInput && videoTitleInput.value ? videoTitleInput.value.trim() : '', link: videoTitleLinkInput && videoTitleLinkInput.value ? videoTitleLinkInput.value.trim() : '', description: videoDescInput && videoDescInput.value ? videoDescInput.value.trim() : '', keywords: '' });
        if (blockReason) { showMessage('Submission blocked: ' + blockReason, 'error'); if (submitBtn) { submitBtn.textContent = orig; submitBtn.disabled = false; } return; }

        let videoUrl = null;
        const provided = videoUrlInput && videoUrlInput.value.trim();
        if (provided) {
          videoUrl = provided;
        } else if (videoFileInput && videoFileInput.files && videoFileInput.files[0]) {
          if (!window.storage) throw new Error('Firebase Storage not initialized');
          const file = videoFileInput.files[0];
          const fileName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const storageRef = window.storage.ref('video_posts/' + fileName);
          const snapshot = await storageRef.put(file);
          videoUrl = await snapshot.ref.getDownloadURL();
        }

        if (!videoUrl) throw new Error('No valid video provided');

        // Block video URLs with disallowed content
        if (containsBlockedKeyword(videoUrl) || (getHostname(videoUrl) && BLOCKED_DOMAINS.some(d => getHostname(videoUrl).endsWith(d)))) throw new Error('Video URL blocked due to disallowed content');

        const ytId = extractYouTubeId(videoUrl);
        const thumbnail = ytId ? ('https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg') : null;

        const doc = {
          video_url: videoUrl,
          title: videoTitleInput && videoTitleInput.value ? videoTitleInput.value.trim() : '',
          title_link: videoTitleLinkInput && videoTitleLinkInput.value ? videoTitleLinkInput.value.trim() : '',
          description: videoDescInput && videoDescInput.value ? videoDescInput.value.trim() : '',
          thumbnail: thumbnail,
          created_at: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
        };

        const dbRef = window.db || window.dbMod;
        if (!dbRef || typeof dbRef.collection !== 'function') throw new Error('No Firestore instance available');
        await dbRef.collection('videos').add(doc);

        showMessage('Video added successfully!', 'success');
        videoForm.reset(); if (videoPreview) videoPreview.innerHTML = ''; if (videoCardPreview) videoCardPreview.innerHTML = '';

      } catch (err) {
        console.error('Video upload error:', err);
        showMessage('Error adding video: ' + (err && err.message || err), 'error');
      } finally {
        if (submitBtn) { submitBtn.textContent = orig; submitBtn.disabled = false; }
      }

    });

  }

  // Backwards-compatible handler for uploadForm (legacy page variant)
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    // Keep existing lightweight behavior but add support for file uploads if present
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitButton = document.getElementById('submitButton');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Adding Site...'; }
      try {
        await ensureConnectionReady();

        const titleEl = document.getElementById('title');
        const descriptionEl = document.getElementById('description');
        const urlEl = document.getElementById('url');
        const keywordsEl = document.getElementById('keywords');
        const fileInput = document.getElementById('upload_image');

        const title = titleEl ? titleEl.value.trim() : '';
        const description = descriptionEl ? descriptionEl.value.trim() : '';
        const url = urlEl ? urlEl.value.trim() : '';
        const keywordsInput = keywordsEl ? keywordsEl.value.trim() : '';

        const keywords = keywordsInput.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);

        // Client-side moderation check
        const blockReason = isBlockedSubmission({ title: title, link: url, description: description, keywords: keywords.join(',') });
        if (blockReason) {
          showMessage('Submission blocked: ' + blockReason, 'error');
          if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Add Site'; }
          return;
        }

        let imageUrl = null;
        const providedImageUrl = document.getElementById('image_url') && document.getElementById('image_url').value.trim();
        if (providedImageUrl) {
          const ok = await validateImageUrl(providedImageUrl);
          if (!ok) throw new Error('Provided image URL is not valid or not reachable');
          imageUrl = providedImageUrl;
        } else if (fileInput && fileInput.files && fileInput.files[0]) {
          if (!window.storage) throw new Error('Firebase Storage not initialized');
          const file = fileInput.files[0];
          const fileName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const storageRef = window.storage.ref('uploads/' + fileName);
          const snapshot = await storageRef.put(file);
          imageUrl = await snapshot.ref.getDownloadURL();
        }

        // Try to use site favicon when no image provided
        if (!imageUrl) {
          const foundFavicon = await findFaviconForSite(url);
          if (foundFavicon) {
            imageUrl = foundFavicon;
          }
        }

        const siteData = {
          title,
          description,
          url,
          imageUrl,
          keywords,
          dateAdded: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) ?
            window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
        };

        const dbRef = window.db || window.dbMod;
        if (!dbRef) throw new Error('No Firestore instance available');

        // Prefer compat db if present
        if (window.db && typeof window.db.collection === 'function') {
          await window.db.collection(window.APP_CONFIG && window.APP_CONFIG.COLLECTION_NAME || 'searchData').add(siteData);
        } else if (dbRef && typeof dbRef.collection === 'function') {
          await dbRef.collection(window.APP_CONFIG && window.APP_CONFIG.COLLECTION_NAME || 'searchData').add(siteData);
        } else {
          throw new Error('Could not get a valid Firestore collection reference');
        }

        showMessage('Site successfully added!', 'success');
        uploadForm.reset();
  const sharedPreview = document.getElementById('imagePreview');
  if (sharedPreview) sharedPreview.innerHTML = '';

      } catch (error) {
        console.error('Error adding site:', error);
        showMessage('Error adding site. Please try again.', 'error');
      } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Add Site'; }
      }
    });
  }

})();
