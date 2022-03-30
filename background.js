let productPort;
let activeTab;

function getProductData() {
    if (productPort) {
        productPort.postMessage({ name: 'getProductData' });
    }
}

function submitProduct() {
    if (productPort) {
        productPort.postMessage({ name: 'submitProduct' });
    }
}

function notify(message) {
    if (productPort) {
        productPort.postMessage({
            name: 'notify',
            text: message
        });
    }
}

function postProduct(options, currentProduct, resubmit = false, resubmitOption = "", contentUrl = "") {
    getCSRFToken(options)
        .then(token => {
            const destination = getDestinationUrl(options, currentProduct, resubmit, resubmitOption, contentUrl);
            fetch(destination, {
                method: 'GET',
                headers: {
                    'CSRF-Token': token
                }
            }).then(response => {
                handleSubmissionError(response, options);
                return response.json();
            }).then(response => {
                if(!resubmit && response.warnMessage === 'Duplicate Product Exist'){
                    handleDuplicateProduct(response, currentProduct, options);
                } else {
                    confirmSubmission(response, currentProduct);
                }
            });
        }).catch(e => console.warn('Failed to submit product: ', e));
}

function getCSRFToken(options) {
    return fetch(`${options.domain}${options.token}`)
        .then(response => {
            handleSubmissionError(response, options);
            return response.json();
        })
        .then(json => {
            if (Object.keys(json).length === 0 && json.constructor === Object) {
                throw new Error(`Unable to login at ${options.domain}`);
            } else {
                return JSON.stringify(json);
            }
        }).catch(e => {
            chrome.runtime.sendMessage({
                name: 'disableProductSubmit'
            });
            notify(`${e.message}. Unable to authenticate, please ensure you are logged into VPN and logged into the target environment.`);
            throw new Error('Unable to fetch CSRF token.');
        });
}

function handleSubmissionError(response, options) {
    if (!response.ok) {
        switch (response.status) {
            case 403:
                notify(`Please login to AEM at ${options.domain} prior to product submission.`);
                break;
            default:
                response.json()
                    .then(error => {
                        if (error.statusText) {
                            notify(`Unable to submit product to AEM. Reason: ${error.statusText}`);
                            throw Error(error.statusText);
                        } else {
                            notify(`Unable to submit product to AEM.`);
                        }
                    });
                break;
        }
        chrome.runtime.sendMessage({
            name: 'disableProductSubmit'
        });
        throw Error(response.statusText);
    }
}

function handleDuplicateProduct(response, currentProduct, options) {
    chrome.runtime.sendMessage({ name: 'handleDuplicateProduct', data: currentProduct, productPath: response.product, currentDirectory: options.destination || '' });
}

function resubmitProduct(resubmitOption, contentUrl) {
    if (productPort) {
        productPort.postMessage({ name: 'resubmitProduct', resubmitOption, contentUrl });
    }
}

function cancelResubmit(product, productPath) {
    if (productPort) {
        productPort.postMessage({
            name: 'setProductPath',
            path: productPath
        });
    }
    chrome.runtime.sendMessage({
        name: 'disableProductSubmit'
    });
    if (product) {
        const data = mapObject(product);
        data.path = productPath;
        createNotification(data);
    } else {
        notify(`Product successfully submitted to AEM at ${productPath} 👍 `);
    }
}

function confirmSubmission(response, product) {
    let productPath = response.product || '';
    if (productPort) {
        productPort.postMessage({
            name: 'setProductPath',
            path: productPath
        });
    }
    chrome.runtime.sendMessage({
        name: 'disableProductSubmit'
    });
    if (product) {
        const data = mapObject(product);
        data.path = productPath;
        createNotification(data);
    } else {
        notify(`Product successfully submitted to AEM at ${productPath} 👍 `);
    }
}

function mapObject(obj) {
    const mappedObject = {};
    Object.keys(obj).map(key => mappedObject[key] = obj[key]);
    return mappedObject;
}

function getDestinationUrl(config, product, resubmit = false, resubmitOption, contentUrl) {
    if (config && product) {
        const url = new URL(`${config.domain}${config.api}`);
        const params = mapObject(product);
        if (config.destination) {
            params.productDirectory = config.destination;
        }
        if (resubmit) {
            params.retry = true;
            params.retryOption = resubmitOption;
            params.checkDuplicate = false;
            if (resubmitOption === 'overwrite') {
                params.overwritePath = contentUrl;
            }
        } else {
            params.checkDuplicate = true;
        }
        url.search = new URLSearchParams(params);
        return url;
    } else {
        throw Error('Unable to form destination URL.');
    }
}

function updateButtonState(el, action, state) {
    const updateData = {
        button: el,
        action: action,
        state: state
    };
    chrome.runtime.sendMessage({ name: 'updateElementState', data: updateData });
}

function createNotification(data) {
    if (data) {
        (async function () {
            if (data.image) {
                let blob = await fetch(data.image).then(r => r.blob());
                data.dataURL = await new Promise(resolve => {
                    let reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
            chrome.notifications.create({
                'type': 'basic',
                'iconUrl': data.dataURL || 'shop.png',
                'title': data.name || '',
                'message': data.path || '',
                'buttons': [{ title: 'Copy' }],
                'requireInteraction': true
            });
        })();
    }
}

function setPort(port) {
    productPort = port;
    productPort.postMessage({ from: 'background', to: 'content' });
    productPort.onMessage.addListener(message => {
        console.debug(message);
        switch (message.name) {
            case 'getProductData':
                chrome.runtime.sendMessage({ name: 'updateForm', data: message.productData, contentUrl: message.contentUrl });
                updateButtonState('save', 'remove', 'is-loading');
                break;
            case 'disableProductSubmit':
                chrome.runtime.sendMessage({ name: 'disableProductSubmit' });
                break;
            case 'createNotification':
                createNotification(message.notificationData);
                break;
            case 'submitProduct':
                postProduct(message.options, message.currentProduct)
                break;
            case 'resubmitProduct':
                postProduct(message.options, message.currentProduct, true, message.resubmitOption, message.contentUrl)
                break;
            default:
                break;
        }
    });
}

function loadContent(tab) {
    chrome.tabs.executeScript(tab, {
        file: '/content.js'
    }, result => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) console.debug('tab: ' + tab + ' lastError: ' + JSON.stringify(lastErr));
    });
}

chrome.runtime.onMessage.addListener (message => {
    switch (message.name) {
        case 'loadPageContent':
            chrome.tabs.query({active:true, currentWindow: true}, function(tabs) {
                activeTab = tabs[0].tabId;
                chrome.tabs.executeScript(activeTab, {
                        file: '/content.js'
                    }, result => {
                        const lastErr = chrome.runtime.lastError;
                        if (lastErr) console.debug('tab: ' + activeTab + ' lastError: ' + JSON.stringify(lastErr));
                        else {
                            getProductData();
                        }
                    });
            });
    }
});

chrome.runtime.onConnect.addListener(setPort);

// chrome.contextMenus.create({ "title": "Product Ingestion", "id": "ingest", contexts: ["selection", "image"] });
// chrome.contextMenus.create({ "title": "Title", "parentId": "ingest", "id": "productTitle", contexts: ["selection"] });
// chrome.contextMenus.create({ "title": "Description", "parentId": "ingest", "id": "productDescription", contexts: ["selection"] });
// chrome.contextMenus.create({ "title": "URL", "parentId": "ingest", "id": "productUrl", contexts: ["selection", "link"] });
// chrome.contextMenus.create({ "title": "Image", "parentId": "ingest", "id": "productImage", contexts: ["selection", "image"] });

chrome.tabs.onActivated.addListener(info => {
    activeTab = info.tabId;
    loadContent(activeTab);
});

chrome.windows.onFocusChanged.addListener(windowId => {
    if (windowId && windowId !== -1) {
        chrome.windows.get(windowId, {populate: true}, w => {
            w.tabs.map(tab => {
                if (tab.active) {
                    activeTab = tab.id;
                    loadContent(activeTab);
                }
            });
        });
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        updateButtonState('save', 'add', 'is-loading');
        getProductData();
    }
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
    switch (index) {
        case 0:
            if (productPort) {
                productPort.postMessage({ name: 'copyProductPath' });
            }
            break;
        default:
            break;
    }
});