(function() {
    'use strict';

    chrome.runtime.sendMessage({name: 'loadPageContent'});
    const bp = chrome.extension.getBackgroundPage();
    const saveProductButton = document.querySelector('#saveProduct');
    const submitProductButton = document.querySelector('#submitProduct');
    const productForm = document.querySelector('.productForm');

    const overwriteButton = document.querySelector('#overwriteButton');
    const createNewButton = document.querySelector('#createNewButton');
    const cancelSubmissionButton = document.querySelector('#cancelSubmissionButton');

    let contentUrl;
    let currentProduct;
    let currentDirectory;
    
    chrome.runtime.onMessage.addListener(message => {
        console.debug(message);
        switch (message.name) {
            case 'updateForm':
                if (message.contentUrl) {
                    setContentUrl(message.contentUrl);
                }
                updateForm(message.data);
                break;
            case 'disableProductSubmit':
                updateElementState(submitProductButton, 'remove', 'is-loading');
                disableSubmitButton(submitProductButton);
                break;
            case 'updateElementState':
                updateElementState(getRequestedButton(message.data.button), message.data.action, message.data.state);
                break;
            case 'handleDuplicateProduct':
                setCurrentProduct(message.data);
                setContentUrl(message.productPath);
                setCurrentDirectory(message.currentDirectory);
                openConfirmationModal();
                break;
            default:
                break;
        }
    });

    function debounce(func, wait, immediate) {
        let timeout;
        return function () {
            let context = this, args = arguments;
            let later = function () {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            let callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    };

    function disableSubmitButton(button) {
        if (button) {
            button.setAttribute('disabled', 'disabled');
        }
    }

    function setContentUrl(url) {
        contentUrl = url;
    }

    function setCurrentProduct(product) {
        currentProduct = product;
    }

    function setCurrentDirectory(directory) {
        currentDirectory = directory;
    }

    function updateElementState(el, action, state) {
        if (el) {
            const classes = el.classList;
            switch (action.toLowerCase()) {
                case 'add':
                    classes.add(state);
                    break;
                case 'remove':
                    setTimeout(() => {
                        classes.remove(state);
                    }, 750);
                    break;
                default:
                    break;
            }
        }
    }

    function getRequestedButton(name) {
        switch (name.toLowerCase()) {
            case 'save':
                return saveProductButton;
            case 'submit':
                return submitProductButton;
            default:
                return false;
        }
    }

    function updateForm(product) {
        const name = document.querySelector('#name');
        const advertiser = document.querySelector('#advertiser');
        const price = document.querySelector('#price');
        const priceDisplay = document.querySelector('#priceDisplay');
        const description = document.querySelector('#description');
        const url = document.querySelector('#url');
        const image = document.querySelector('#image');
        const imagePrefix = document.querySelector('#imagePrefix');
        const brand = document.querySelector('#brand');
        const productPreview = document.querySelectorAll('.productPreview');

        Array.from(productPreview).map(preview => preview.remove());

        if (product.name) {
            name.value = product.name;
        }
        if (product.advertiser) {
            advertiser.value = product.advertiser;
        }
        if (product.price) {
            price.value = product.price;
        }
        if (product.priceDisplay) {
            priceDisplay.value = product.priceDisplay;
        }
        if (product.description) {
            description.value = product.description;
        }
        if (product.url) {
            url.value = product.url;
        }
        if (product.image) {
            image.value = product.image;
        }
        if (product.imagePrefix) {
            imagePrefix.value = product.imagePrefix;
        }
        if (product.brand) {
            brand.value = product.brand;
        }

        insertProductCard(image, product);
    }

    function saveProductData() {
        const product = {};
        const entry = {};

        Array.from(productForm.elements).map(element => {
            if (element.name && element.value) {
                product[element.name] = element.value;
            }
        });

        if (contentUrl) {
            entry[contentUrl] = product;
            chrome.storage.local.set(entry);
        }
    }

    function insertProductCard(element, product) {
        element.insertAdjacentHTML('afterend', `
            <div class="productPreview section">
                <div class="card">
                    <div class="card-image">
                        <figure class="image is-4by3">
                            <img src="${product.image ? product.image : 'https://via.placeholder.com/450x450'}" alt="Product Image">
                        </figure>
                    </div>
                    <div class="card-content">
                        <div class="media">
                        <div class="media-content">
                            <p class="title is-4">${product.name ? product.name : ''} <span class="subtitle has-text-grey-light is-6">${product.price ? `${product.price}` : ''}</span></p>
                            <a class="subtitle has-text-link is-6" href="${product.url}">${product.url ? product.url : ''}</a>
                        </div>
                        </div>
                        
                        <div class="content">
                            ${product.description ? product.description : ''}
                        </div>

                        <div class="content">
                            <p class="subtitle is-6 has-text-grey-light">${product.advertiser ? 'From: '+product.advertiser : ''}</p>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }

    function handleDuplicateProduct (userChoice) {
        if(userChoice && (userChoice === 'overwrite') || (userChoice === 'create')){
            bp.resubmitProduct(userChoice, contentUrl);
        } else if (userChoice && userChoice === 'cancel') {
            bp.cancelResubmit(currentProduct, contentUrl);
        }
    }

    function hideModal() {
        document.querySelector('#confirmationModal').style.display = "none";
    }

    function openConfirmationModal() {
        if(contentUrl.substring(0, contentUrl.lastIndexOf('/')) === currentDirectory){
            createNewButton.style.display = "none";
        }
        document.querySelector('#duplicateMessage').textContent += contentUrl;
        document.querySelector('#confirmationModal').style.display = "block";
    }

    if (bp && productForm) {
        if (submitProductButton) {
            submitProductButton.addEventListener('click', (e) => {
                const isValidForm = productForm.checkValidity();
                if (isValidForm) {
                    e.preventDefault();
                    updateElementState(submitProductButton, 'add', 'is-loading');
                    bp.submitProduct();
                }
            });
        }

        if (overwriteButton) {
            overwriteButton.addEventListener('click', (e) => {
                e.preventDefault();
                hideModal();
                handleDuplicateProduct('overwrite');
            });
        }

        if (createNewButton) {
            createNewButton.addEventListener('click', (e) => {
                e.preventDefault();
                hideModal();
                handleDuplicateProduct('create');
            });
        }

        if (cancelSubmissionButton) {
            cancelSubmissionButton.addEventListener('click', (e) => {
                e.preventDefault();
                hideModal();
                handleDuplicateProduct('cancel');
            });
        }


        productForm.addEventListener('change', saveProductData);
        productForm.addEventListener('keyup', debounce(saveProductData, 250));
    }

})();