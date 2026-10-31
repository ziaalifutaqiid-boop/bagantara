// ==========================================
// MESIN PERENDER UI JASTIP (PURE DOM CLONE - ZERO FALLBACK)
// ==========================================

window.UIJastip = {
    itemCounter: 0,
    
    init: function() {
        const container = document.getElementById('jastipItemsContainer');
        if (!container) return;
        
        container.innerHTML = '';
        this.itemCounter = 0;
        
        this.addItem();
        
        const btnAdd = document.getElementById('btnAddJastipItem');
        if (btnAdd) {
            const newBtnAdd = btnAdd.cloneNode(true);
            btnAdd.parentNode.replaceChild(newBtnAdd, btnAdd);
            newBtnAdd.addEventListener('click', () => this.addItem());
        }
    },
    
    addItem: function() {
        this.itemCounter++;
        const id = this.itemCounter;
        const container = document.getElementById('jastipItemsContainer');
        const template = document.getElementById('tpl-jastip-item');
        
        if (!template || !container) return;
        
        const clone = template.content.cloneNode(true);
        
        const card = clone.querySelector('.jastip-item-card');
        card.id = `jastip-card-${id}`;
        
        const inputName = clone.querySelector('.jastip-val-name');
        const inputPrice = clone.querySelector('.jastip-val-price');
        const btnRemove = clone.querySelector('.btn-remove-item');
        const btnMin = clone.querySelector('.tpl-btn-min');
        const btnPlus = clone.querySelector('.tpl-btn-plus');
        const qtySpan = clone.querySelector('.jastip-qty-value');
        
        qtySpan.id = `jastip-qty-${id}`;
        
        inputName.addEventListener('input', () => this.triggerUpdate());
        inputPrice.addEventListener('input', () => this.triggerUpdate());
        btnRemove.addEventListener('click', () => this.removeItem(id));
        btnMin.addEventListener('click', () => this.updateQty(id, -1));
        btnPlus.addEventListener('click', () => this.updateQty(id, 1));
        
        container.appendChild(clone);
        this.triggerUpdate();
    },
    
    removeItem: function(id) {
        const card = document.getElementById(`jastip-card-${id}`);
        if (card) {
            card.remove();
            this.triggerUpdate();
        }
    },
    
    updateQty: function(id, change) {
        const qtySpan = document.getElementById(`jastip-qty-${id}`);
        if (!qtySpan) return;
        
        const parsedQty = parseInt(qtySpan.getAttribute('data-val'), 10);
        let currentQty = !isNaN(parsedQty) ? parsedQty : 1;
        currentQty += change;
        if (currentQty < 1) currentQty = 1;
        
        qtySpan.setAttribute('data-val', currentQty);
        qtySpan.textContent = currentQty;
        
        this.triggerUpdate();
    },
    
    triggerUpdate: function() {
        window.dispatchEvent(new Event('jastipUIUpdated'));
    },
    
    extractData: function() {
        const container = document.getElementById('jastipItemsContainer');
        if (!container) return [];
        
        const cards = container.querySelectorAll('.jastip-item-card');
        let items = [];
        
        cards.forEach(card => {
            const name = card.querySelector('.jastip-val-name').value.trim();
            const parsedPrice = parseInt(card.querySelector('.jastip-val-price').value, 10);
            const price = !isNaN(parsedPrice) ? parsedPrice : 0;
            const parsedQty = parseInt(card.querySelector('.jastip-qty-value').getAttribute('data-val'), 10);
            const qty = !isNaN(parsedQty) ? parsedQty : 1;
            
            if (name !== '' && price > 0) {
                items.push({ name: name, price: price, qty: qty, subtotal: price * qty });
            }
        });
        
        return items;
    }
};