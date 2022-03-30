const optionsForm = document.querySelector('.optionsForm');
// Saves options to chrome.storage
function save_options(e) {
    const isValidForm = optionsForm.checkValidity();
    if (isValidForm) {
        e.preventDefault();
        const domain = document.querySelector('#domain').value.toLowerCase();
        const brand = document.querySelector('#brand').value;
        const destination = document.querySelector('#destination').value;
        const save = document.querySelector('#save');
        chrome.storage.local.set({
            domain: domain,
            brand: brand,
            destination: destination
        }, () => {
            // Update status to let user know options were saved.
            save.classList.add('is-loading');
            setTimeout(() => {
                save.classList.remove('is-loading');
            }, 750);
        });
    }
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    // Use default value
    chrome.storage.local.get({
        domain: '',
        brand: '',
        destination: false
    }, items => {
        document.querySelector('#domain').value = items.domain;
        document.querySelector('#brand').value = items.brand;
        if (items.destination) {
            document.querySelector('#destination').value = items.destination;
        }
    });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.querySelector('#save').addEventListener('click', save_options);