(function() {
    'use strict';

    let contentUrl = window.location.href;
    const productPort = chrome.runtime.connect({ name: 'product-port' });
    let products = getAllProducts();
    const options = {
        domain: 'https://author.hgtv-prod2.sni.hgtv.com',
        token: '/libs/granite/csrf/token.json',
        api: '/apps/author/api/product-extension',
        brand: 'hgtv'
    };
    let currentProduct;
    let productPath;

    getOptions();

    productPort.postMessage({ from: 'content', to: 'background' });
    productPort.onMessage.addListener(message => {
        console.debug(message.name);
        switch (message.name) {
            case 'getProductData':
                getProductData();
                break;
            case 'submitProduct':
                submitProduct();
                break;
            case 'resubmitProduct':
                resubmitProduct(message.resubmitOption, message.contentUrl);
                break;
            case 'setProductPath':
                setProductPath(message.path);
                break;
            case 'copyProductPath':
                if (productPath) {
                    copyToClipboard(productPath);
                }
                break;
            case 'notify':
                notify(message.text);
                break;
            default:
                break;
        }
    });

    function notify(message) {
        if (message) alert(message);
    }

    function getOptions() {
        chrome.storage.local.get(['domain', 'brand', 'destination'], (results) => {
            if(results.brand && results.brand === 'sports' ){
              options.domain = results.domain ? `https://author.${results.domain}.sports.aws.discovery.com` : options.domain;
            } else {
              options.domain = results.domain && results.brand ? `https://author.${results.domain}.sni.${results.brand}.com` : options.domain;
            }
            options.brand = results.brand || options.brand;
            if (results.destination) {
                options.destination = results.destination;
            }
        });
    }

    function submitProduct() {
        productPort.postMessage({
            name: 'submitProduct',
            currentProduct,
            options
        });
    }

    function resubmitProduct(resubmitOption, contentUrl) {
        productPort.postMessage({
            name: 'resubmitProduct',
            currentProduct,
            options,
            resubmitOption,
            contentUrl
        });
    }

    function setProductPath(path) {
        if (path) productPath = path;
    }

    function getProductData() {
        contentUrl = window.location.href;
        getStoredProduct(contentUrl)
            .then(product => {
                if (product[contentUrl]) {
                    currentProduct = product[contentUrl];
                    productPort.postMessage({ name: 'getProductData', productData: currentProduct, contentUrl });
                } else {
                    throw Error(`Unable to find stored product associated with ${contentUrl}.`);
                }
            })
            .catch(e => console.warn(e));
    }

    function getStoredProduct(key) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(key, items => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError.message);
                } else if (Object.keys(items).length === 0 && items.constructor === Object) {
                    const key = contentUrl;
                    products = getAllProducts();
                    setStoredProduct(key, getMostDetailedProduct(products));
                    new Promise(resolve => {
                        chrome.storage.local.get(key, product => resolve(product));
                    }).then(product => resolve(product));
                } else {
                    resolve(items);
                }
            });
        });
        
    }

    function setStoredProduct(key, product) {
        const obj = {};
        obj[key] = product;
        chrome.storage.local.set(obj);
    }

    function copyToClipboard(text) {
        function oncopy(event) {
            document.removeEventListener('copy', oncopy, true);
            // Hide the event from the page to prevent tampering.
            event.stopImmediatePropagation();

            // Overwrite the clipboard content.
            event.preventDefault();
            event.clipboardData.setData('text/plain', text);
        }
        document.addEventListener('copy', oncopy, true);

        // Requires the clipboardWrite permission, or a user gesture:
        document.execCommand('copy');
    }

    function getAncestorsUntil(element, boundary, filter) {
        let ancestors = [];
        while (element && element !== document) {
            if (boundary) {
                if (element.matches(boundary)) break;
            }

            if (filter) {
                if (element.matches(filter)) {
                    ancestors.push(element);
                }
            } else {
                ancestors.push(element);
            }

            element = element.parentNode;
        }
        return ancestors;
    }

    function getValue(element) {
        return element.getAttribute('content')
            || element.innerText
            || element.getAttribute('src')
            || element.getAttribute('href')
            || null;
    }

    function setProductProperty(thing, name, val) {
        if (typeof (val) === 'string') val = val.trim();

        if (Array.isArray(thing[name])) {
            thing[name].push(val);
        } else {
            thing[name] = val;
        }
        
        return thing;
    }

    function getProduct(element, sel) {
        const price = getPrice(sel.iprop);
        const advertiser = getAdvertiser();
        let product = {
            type: element.getAttribute(sel.type)
        };

        let properties = Array.from(element.querySelectorAll(sel.prop))
            .filter(item => getAncestorsUntil(item, sel.hash, sel.scope).length === 0)
            .map(item => setProductProperty(
                product,
                item.getAttribute(sel.iprop),
                item.matches(sel.scope) ? getProduct(item) : getValue(item)
            ));

        if (price) {
            product = setProductProperty(product, 'price', price);
        }

        if (advertiser) {
            product = setProductProperty(product, 'advertiser', advertiser);
        }

        product = setProductProperty(product, 'url', contentUrl);

        return product;
    }

    function getAdvertiser() {
        const name = document.querySelector('[property="og:site_name"]');
        return name ? name.getAttribute('content') : null;
    }

    function getPrice(sel) {
        const price = document.querySelector(`[${sel}="price"]`);
        return price ? price.getAttribute('content') : null;
    }

    function getAllProducts() {
        let products;

        products = Array.from(document.querySelectorAll('[type="application/ld+json"], [itemtype="http://schema.org/Product"], [typeof="Product"]')).map(thing => {
            let product = false,
                hash,
                attr;

            if (thing.type === 'application/ld+json') {
                let obj = JSON.parse(thing.innerText);
                product = {};
                if ('@graph' in obj){
                    for(let node of obj['@graph']){
                        if(node['@type'] === 'Product'){
                            product = buildProductFromSchemaObject(node);
                            break;
                        }
                    }
                }else{
                    if (obj && obj['@type'] === 'Product') {
                        product = buildProductFromSchemaObject(obj);
                    }
                }
            } else if (typeof thing.attributes !== 'undefined') {
                attr = thing.attributes;
                if (typeof attr.itemtype !== 'undefined' && attr.itemtype.value === 'http://schema.org/Product') {
                    hash = `h-${new Date().getUTCMilliseconds()}`;
                    thing.classList.add(hash);
                    product = getProduct(thing, {
                        type: 'itemtype',
                        iprop: 'itemprop',
                        prop: '[itemprop]',
                        scope: '[itemscope]',
                        hash: `.${hash}`
                    });
                } else if (typeof attr.typeof !== 'undefined' && attr.typeof.value === 'Product') {
                    hash = `h-${new Date().getUTCMilliseconds()}`;
                    thing.classList.add(hash);
                    product = getProduct(thing, {
                        type: 'typeof',
                        iprop: 'property',
                        prop: '[property]',
                        scope: '[typeof]',
                        hash: `.${hash}`
                    });
                }
            }

            return product;
        }).filter(product => product);

        return products;
    }

    function buildProductFromSchemaObject(obj){
        return {
            name: obj.name,
            description: obj.description,
            image: obj.image,
            url: contentUrl,
            price: ((obj && obj.offers) ? obj.offers.price : ''),
            advertiser: getAdvertiser() || '',
            type: 'Product'
        };
    }

    function getDefinedProductKeys(product) {
        let keys = Object.keys(product);
        let definedKeys = keys.filter(key => {
            let val = product[key];
            if (val !== '' && typeof val !== 'undefined') {
                return val;
            }
        });
        return definedKeys;
    }

    function getMostDetailedProduct(products) {
        let mostDetailedProduct = products.reduce((selected, current) => {
            let numOfSelectedKeys = getDefinedProductKeys(selected).length;
            let numOfCurrentKeys = getDefinedProductKeys(current).length;
            return (numOfCurrentKeys > numOfSelectedKeys) ? current : selected;
        }, {});
        return cleanProduct(pruneProductData(mostDetailedProduct));
    }

    function pruneProductData(product) {
        for (let key in product) {
            let val = product[key];
            if (Array.isArray(val)) {
                product[key] = val[0];
            }
        }
        return product;
    }

    function cleanProduct(product) {
        if (product.image) {
            if (product.image.startsWith('//')) {
                product.image = `${window.location.protocol}${product.image}`;
            }
            if (!product.image.includes('http')) {
                product.image = `${window.location.origin}${product.image}`;
            }
        }
        if (!product.url) {
            product.url = window.location.href;
        }
        return product;
    }
})();