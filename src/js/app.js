document.getElementById('websiteForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Show loading state
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Adding...';
    submitBtn.disabled = true;
    
    // Get form values
    const website_title = document.getElementById('website_title').value.trim();
    const website_link = document.getElementById('website_link').value.trim();
    const website_keywords = document.getElementById('website_keywords').value.trim();
    const website_description = document.getElementById('website_description').value.trim();
    const fileInput = document.getElementById('upload_image');
    
    // Validation
    if (!website_title || !website_link || !website_keywords || !website_description || !fileInput.files[0]) {
        showMessage('All fields are required.', 'error');
        resetButton(submitBtn, originalText);
        return;
    }
    
    try {
        console.log("Starting website addition process...");
        
        // Upload image to Firebase Storage
        const file = fileInput.files[0];
        const fileName = Date.now() + '_' + file.name;
        const storageRef = storage.ref('website_images/' + fileName);
        
        console.log("Uploading image...");
        const snapshot = await storageRef.put(file);
        const imageUrl = await snapshot.ref.getDownloadURL();
        console.log("Image uploaded successfully:", imageUrl);
        
        // Prepare keywords array
        const keywordsArray = website_keywords.split(',').map(kw => kw.trim());
        
        // Add data to Firestore
        const websiteData = {
            website_title: website_title,
            website_link: website_link,
            website_keywords: keywordsArray,
            website_description: website_description,
            website_image: imageUrl,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log("Adding data to Firestore...");
        await db.collection('websites').add(websiteData);
        
        console.log("Website added successfully!");
        showMessage('Website added successfully!', 'success');
        resetForm();
        
    } catch (error) {
        console.error('Error adding website:', error);
        showMessage('Error adding website: ' + error.message, 'error');
    } finally {
        resetButton(submitBtn, originalText);
    }
});

// Helper functions
function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            messageDiv.innerHTML = '';
        }, 5000);
    }
}

function resetForm() {
    document.getElementById('websiteForm').reset();
}

function resetButton(button, originalText) {
    button.textContent = originalText;
    button.disabled = false;
}

// Real-time listener for websites (optional)
function setupRealTimeListener() {
    db.collection('websites')
        .orderBy('created_at', 'desc')
        .onSnapshot((snapshot) => {
            console.log(`Total websites in database: ${snapshot.size}`);
        }, (error) => {
            console.error('Error in real-time listener:', error);
        });
}

// Initialize real-time listener when page loads
document.addEventListener('DOMContentLoaded', function() {
    setupRealTimeListener();
});