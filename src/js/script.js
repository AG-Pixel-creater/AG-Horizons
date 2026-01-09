document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('welcomeForm');
    const greetingDiv = document.getElementById('greeting');

    // If the expected form isn't present on this page, skip wiring the submit handler.
    if (!form) {
        // Nothing to do on pages without the welcome form.
        return;
    }

    form.addEventListener('submit', function(event) {
        event.preventDefault();

        const formData = new FormData(form);
        fetch('php/welcome.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.text())
        .then(data => {
            if (greetingDiv) greetingDiv.innerHTML = data;
        })
        .catch(error => {
            console.error('Error:', error);
            if (greetingDiv) greetingDiv.textContent = 'An error occurred. Please try again.';
        });
    });
});