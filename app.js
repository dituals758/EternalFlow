export class EternalFlowApp {
    constructor() {
        this.config = {
            APP_VERSION: '2.0.1',
            DB_NAME: 'EternalFlowDB',
            DB_VERSION: 1,
            TIME_UNITS: [
                { name: 'years', divisor: 31536000000, labels: ['лет', 'года', 'год'] },
                { name: 'months', divisor: 2628000000, labels: ['месяцев', 'месяца', 'месяц'] },
                { name: 'days', divisor: 86400000, labels: ['дней', 'дня', 'день'] },
                { name: 'hours', divisor: 3600000, labels: ['часов', 'часа', 'час'] },
                { name: 'minutes', divisor: 60000, labels: ['минут', 'минуты', 'минута'] },
                { name: 'seconds', divisor: 1000, labels: ['секунд', 'секунды', 'секунда'] }
            ],
            MAX_EVENTS: 100
        };
        
        this.events = [];
        this.deferredPrompt = null;
        this.timerUpdateInterval = null;
        this.editingEventId = null;
        this.filter = 'all';
        this.sort = 'date-asc';
        this.searchQuery = '';
        this.db = null;
        
        this.init();
    }

    async init() {
        this.createParticles();
        await this.initDB();
        await this.loadEvents();
        this.setupEventListeners();
        this.startTimers();
        this.setCurrentDateTime();
        this.setupServiceWorker();
        this.setupInstallPrompt();
        this.setAppVersion();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.config.DB_NAME, this.config.DB_VERSION);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('events')) {
                    const store = db.createObjectStore('events', { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'name' });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async loadEvents() {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                this.events = event.target.result || [];
                this.renderEvents();
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Error loading events:', event.target.error);
                this.showNotification('Ошибка загрузки данных', 'error');
                reject(event.target.error);
            };
        });
    }

    async saveEvent(event) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const request = event.id ? store.put(event) : store.add({
                ...event,
                id: Date.now().toString(),
                createdAt: new Date().toISOString()
            });
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Error saving event:', event.target.error);
                this.showNotification('Ошибка сохранения', 'error');
                reject(event.target.error);
            };
        });
    }

    async deleteEvent(id) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            const request = store.delete(id);
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Error deleting event:', event.target.error);
                this.showNotification('Ошибка удаления', 'error');
                reject(event.target.error);
            };
        });
    }

    async loadSettings() {
        if (!this.db) return;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            
            ['filter', 'sort'].forEach(name => {
                const request = store.get(name);
                request.onsuccess = (event) => {
                    if (event.target.result) {
                        this[name] = event.target.result.value;
                    }
                };
            });
            
            transaction.oncomplete = () => {
                this.applySettings();
                resolve();
            };
        });
    }

    async saveSetting(name, value) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ name, value });
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = (event) => {
                console.error(`Error saving setting ${name}:`, event.target.error);
                reject(event.target.error);
            };
        });
    }

    applySettings() {
        this.renderEvents();
        
        const filterSelect = document.getElementById('filterSelect');
        if (filterSelect) filterSelect.value = this.filter;
        
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) sortSelect.value = this.sort;
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = this.searchQuery;
    }

    setAppVersion() {
        const versionElements = document.querySelectorAll('.app-version');
        versionElements.forEach(el => {
            el.textContent = `v${this.config.APP_VERSION}`;
        });
    }

    setupInstallPrompt() {
        const handleInstallClick = async () => {
            if (!this.deferredPrompt) return;
            
            try {
                this.deferredPrompt.prompt();
                const { outcome } = await this.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    this.showNotification('Приложение установлено!', 'success');
                }
            } catch (error) {
                console.error('Ошибка установки:', error);
                this.showNotification('Ошибка установки', 'error');
            } finally {
                this.deferredPrompt = null;
                const island = document.getElementById('dynamicIsland');
                if (island) island.style.display = 'none';
            }
        };

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const island = document.getElementById('dynamicIsland');
            if (island) {
                island.style.display = 'flex';
                island.addEventListener('click', handleInstallClick);
            }
        });
    }

    createParticles() {
        const container = document.getElementById('particles');
        if (!container) return;
        
        const colors = ['#b2ccf6', '#36bff1', '#9f5ae3', '#2059c2', '#122878'];
        const particleCount = 20;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            
            const size = Math.random() * 4 + 1;
            const posX = Math.random() * 100;
            const posY = Math.random() * 100;
            const duration = Math.random() * 10 + 10;
            const delay = Math.random() * 5;
            
            particle.style.cssText = `
                width: ${size}px;
                height: ${size}px;
                left: ${posX}%;
                top: ${posY}%;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                opacity: ${Math.random() * 0.2 + 0.05};
                animation-duration: ${duration}s;
                animation-delay: ${delay}s;
                border-radius: 50%;
            `;
            
            container.appendChild(particle);
        }
    }

    setCurrentDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        const eventDateInput = document.getElementById('eventDate');
        if (eventDateInput) {
            eventDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
    }

    setupEventListeners() {
        const saveBtn = document.getElementById('saveEventBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveEventForm());
        }
        
        const titleInput = document.getElementById('eventTitle');
        if (titleInput) {
            titleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.saveEventForm();
            });
        }
        
        const importBtn = document.getElementById('importBtn');
        const exportBtn = document.getElementById('exportBtn');
        const clearBtn = document.getElementById('clearBtn');
        
        if (importBtn) importBtn.addEventListener('click', () => this.importEvents());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportEvents());
        if (clearBtn) clearBtn.addEventListener('click', () => this.showClearConfirmation());
        
        // Filter and sort
        const filterSelect = document.getElementById('filterSelect');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.filter = e.target.value;
                this.saveSetting('filter', this.filter);
                this.renderEvents();
            });
        }
        
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sort = e.target.value;
                this.saveSetting('sort', this.sort);
                this.renderEvents();
            });
        }
        
        // Search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderEvents();
            });
        }
    }

    async saveEventForm() {
        const titleInput = document.getElementById('eventTitle');
        const dateInput = document.getElementById('eventDate');
        
        const title = (titleInput?.value || '').trim();
        const dateTime = dateInput?.value;
        
        if (!title) {
            this.showNotification('Введите название события', 'error');
            titleInput?.focus();
            return;
        }
        
        if (!dateTime) {
            this.showNotification('Выберите дату и время', 'error');
            dateInput?.focus();
            return;
        }
        
        const targetDate = new Date(dateTime);
        if (isNaN(targetDate.getTime())) {
            this.showNotification('Недопустимый формат даты и времени', 'error');
            return;
        }
        
        try {
            if (this.editingEventId) {
                // Update existing event
                const event = this.events.find(e => e.id === this.editingEventId);
                if (event) {
                    event.title = title;
                    event.date = targetDate.toISOString();
                    await this.saveEvent(event);
                    this.showNotification('Событие обновлено', 'success');
                }
                this.editingEventId = null;
            } else {
                // Create new event
                await this.saveEvent({
                    title,
                    date: targetDate.toISOString()
                });
                this.showNotification('Событие добавлено', 'success');
            }
            
            await this.loadEvents();
            
            if (titleInput) titleInput.value = '';
            this.setCurrentDateTime();
            if (titleInput) titleInput.focus();
            
            // Reset button text
            const saveBtn = document.getElementById('saveEventBtn');
            if (saveBtn) {
                saveBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                        <path fill="white" d="M17,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3M19,19H5V5H16.17L19,7.83V19M12,12A4,4 0 0,0 8,16A4,4 0 0,0 12,20A4,4 0 0,0 16,16A4,4 0 0,0 12,12Z"/>
                    </svg>
                    Добавить событие
                `;
            }
        } catch (error) {
            console.error('Error saving event:', error);
            this.showNotification('Ошибка сохранения', 'error');
        }
    }

    editEvent(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;
        
        const titleInput = document.getElementById('eventTitle');
        const dateInput = document.getElementById('eventDate');
        const saveBtn = document.getElementById('saveEventBtn');
        
        if (titleInput && dateInput && saveBtn) {
            this.editingEventId = eventId;
            titleInput.value = event.title;
            
            const date = new Date(event.date);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            dateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
            
            saveBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path fill="white" d="M21.7,7.3L16.7,2.3C16.5,2.1 16.3,2 16,2H4C2.9,2 2,2.9 2,4V20C2,21.1 2.9,22 4,22H20C21.1,22 22,21.1 22,20V8C22,7.7 21.9,7.5 21.7,7.3M7,20H4V17H7V20M11,20H8V17H11V20M11,14H8V11H11V14M15,20H12V17H15V20M20,20H16V16H14V14H16V11H14V9H16V6H14V4H16V7.6L20,11.6V20Z"/>
                </svg>
                Сохранить изменения
            `;
            
            titleInput.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    showDeleteConfirmation(eventId) {
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <p>Вы уверены, что хотите удалить это событие?</p>
                <div class="modal-buttons">
                    <button id="confirmDelete" class="btn danger">Удалить</button>
                    <button id="cancelDelete" class="btn">Отмена</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('confirmDelete').addEventListener('click', async () => {
            try {
                await this.deleteEvent(eventId);
                await this.loadEvents();
                this.showNotification('Событие удалено', 'success');
            } catch (error) {
                console.error('Error deleting event:', error);
                this.showNotification('Ошибка удаления', 'error');
            } finally {
                modal.remove();
            }
        });
        
        document.getElementById('cancelDelete').addEventListener('click', () => {
            modal.remove();
        });
    }

    showClearConfirmation() {
        if (this.events.length === 0) {
            this.showNotification('Нет событий для очистки', 'info');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <p>Вы уверены, что хотите удалить ВСЕ события? Это действие нельзя отменить.</p>
                <div class="modal-buttons">
                    <button id="confirmClear" class="btn danger">Удалить всё</button>
                    <button id="cancelClear" class="btn">Отмена</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('confirmClear').addEventListener('click', async () => {
            try {
                const transaction = this.db.transaction(['events'], 'readwrite');
                const store = transaction.objectStore('events');
                store.clear();
                
                transaction.oncomplete = async () => {
                    this.events = [];
                    this.renderEvents();
                    this.showNotification('Все события удалены', 'success');
                };
            } catch (error) {
                console.error('Error clearing events:', error);
                this.showNotification('Ошибка очистки', 'error');
            } finally {
                modal.remove();
            }
        });
        
        document.getElementById('cancelClear').addEventListener('click', () => {
            modal.remove();
        });
    }

    renderEvents() {
        const container = document.getElementById('eventsContainer');
        if (!container) return;
        
        // Clear container
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        
        // Filter events
        let filteredEvents = [...this.events];
        const now = new Date();
        
        if (this.filter === 'upcoming') {
            filteredEvents = filteredEvents.filter(e => new Date(e.date) > now);
        } else if (this.filter === 'past') {
            filteredEvents = filteredEvents.filter(e => new Date(e.date) <= now);
        }
        
        // Search
        if (this.searchQuery) {
            filteredEvents = filteredEvents.filter(e => 
                e.title.toLowerCase().includes(this.searchQuery)
            );
        }
        
        // Sort events
        filteredEvents.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            
            switch (this.sort) {
                case 'date-asc': return dateA - dateB;
                case 'date-desc': return dateB - dateA;
                case 'title-asc': return a.title.localeCompare(b.title);
                case 'title-desc': return b.title.localeCompare(a.title);
                case 'added-asc': 
                    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
                case 'added-desc': 
                    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                default: return dateA - dateB;
            }
        });
        
        if (filteredEvents.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.setAttribute('aria-label', 'Нет событий');
            emptyState.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#36bff1" d="M256,32C132.3,32,32,132.3,32,256s100.3,224,224,224s224-100.3,224-224S379.7,32,256,32z M410.5,297.5l-32.9,32.9l-16.5-16.5l32.9-32.9L410.5,297.5z M365.9,252.9l-32.9,32.9l-16.5-16.5l32.9-32.9L365.9,252.9z M321.3,208.3l-32.9,32.9l-16.5-16.5l32.9-32.9L321.3,208.3z M276.7,163.7l-32.9,32.9l-16.5-16.5l32.9-32.9L276.7,163.7z"/></svg>
                <p>Нет событий</p>
                <p>${this.searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Добавьте события для отслеживания'}</p>
            `;
            container.appendChild(emptyState);
            return;
        }
        
        filteredEvents.forEach(event => {
            const card = document.createElement('div');
            card.className = 'event-card';
            card.dataset.id = event.id;
            
            const header = document.createElement('div');
            header.className = 'event-header';
            
            const titleDiv = document.createElement('div');
            titleDiv.className = 'event-title';
            titleDiv.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14,12L10,8V11H2V13H10V16M20,18V6C20,4.89 19.1,4 18,4H6A2,2 0 0,0 4,6V18A2,2 0 0,0 6,20H18A2,2 0 0,0 20,18Z" fill="#b2ccf6"/></svg>
                ${this.escapeHTML(event.title)}
            `;
            
            const dateDiv = document.createElement('div');
            dateDiv.className = 'event-date';
            dateDiv.setAttribute('aria-label', 'Дата события');
            dateDiv.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z" fill="#36bff1"/></svg>
                ${this.formatDate(new Date(event.date))}
            `;
            
            header.appendChild(titleDiv);
            header.appendChild(dateDiv);
            
            const timerContainer = document.createElement('div');
            timerContainer.className = 'time-grid';
            timerContainer.id = `timer-${event.id}`;
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'event-actions';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.setAttribute('aria-label', 'Редактировать событие');
            editBtn.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" fill="#36bff1"/>
                </svg>
            `;
            editBtn.addEventListener('click', () => this.editEvent(event.id));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.setAttribute('aria-label', 'Удалить событие');
            deleteBtn.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" fill="#ff6b6b"/>
                </svg>
            `;
            deleteBtn.addEventListener('click', () => this.showDeleteConfirmation(event.id));
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            
            card.appendChild(header);
            card.appendChild(timerContainer);
            card.appendChild(actionsDiv);
            
            container.appendChild(card);
            this.updateTimer(event.id);
        });
    }

    startTimers() {
        if (this.timerUpdateInterval) {
            clearInterval(this.timerUpdateInterval);
        }
        
        // Use requestIdleCallback for better performance
        const updateTimers = () => {
            this.updateAllTimers();
            this.timerUpdateInterval = setTimeout(updateTimers, 1000);
        };
        
        updateTimers();
    }

    updateAllTimers() {
        const now = Date.now();
        this.events.forEach(event => {
            this.updateTimer(event.id, now);
        });
    }

    updateTimer(eventId, now = Date.now()) {
        const container = document.getElementById(`timer-${eventId}`);
        if (!container) return;
        
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;
        
        const targetDate = new Date(event.date).getTime();
        const diff = targetDate - now;
        const isPast = diff < 0;
        const absDiff = Math.abs(diff);
        
        const timeValues = {};
        let remaining = absDiff;
        
        for (const unit of this.config.TIME_UNITS) {
            const value = Math.floor(remaining / unit.divisor);
            timeValues[unit.name] = value;
            remaining -= value * unit.divisor;
        }
        
        let hasNonZero = false;
        const timerFrag = document.createDocumentFragment();
        
        if (isPast) {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'time-unit past-indicator';
            unitDiv.innerHTML = `
                <div class="time-value">Прошло:</div>
            `;
            timerFrag.appendChild(unitDiv);
        }
        
        for (const unit of this.config.TIME_UNITS) {
            const value = timeValues[unit.name];
            if (value > 0 || hasNonZero) {
                hasNonZero = true;
                const label = this.getCorrectLabel(value, unit.labels);
                
                const unitDiv = document.createElement('div');
                unitDiv.className = 'time-unit';
                unitDiv.setAttribute('aria-label', `${value} ${label}`);
                unitDiv.innerHTML = `
                    <div class="time-value">${value}</div>
                    <div class="time-label">${label}</div>
                `;
                timerFrag.appendChild(unitDiv);
            }
        }
        
        // Clear and update
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        container.appendChild(timerFrag);
    }

    getCorrectLabel(value, labels) {
        if (value % 10 === 1 && value % 100 !== 11) return labels[2];
        if (value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 10 || value % 100 >= 20)) 
            return labels[1];
        return labels[0];
    }

    formatDate(date) {
        return date.toLocaleString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    async exportEvents() {
        try {
            if (this.events.length === 0) {
                this.showNotification('Нет событий для экспорта', 'info');
                return;
            }
            
            const data = {
                version: this.config.APP_VERSION,
                timestamp: new Date().toISOString(),
                events: this.events
            };
            
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const exportFileDefaultName = `EternalFlow_${new Date().toISOString().slice(0, 10)}.json`;
            
            const link = document.createElement('a');
            link.href = url;
            link.download = exportFileDefaultName;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                this.showNotification('События экспортированы', 'success');
            }, 100);
            
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            this.showNotification('Ошибка экспорта данных', 'error');
        }
    }

    async importEvents() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (event) => resolve(event.target.result);
                    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
                    reader.readAsText(file);
                });
                
                const data = JSON.parse(fileContent);
                if (!data.events || !Array.isArray(data.events)) {
                    throw new Error('Неверный формат файла');
                }
                
                const validEvents = data.events.filter(ev =>
                    ev.id && typeof ev.id === 'string' &&
                    ev.title && typeof ev.title === 'string' &&
                    ev.title.length <= 50 &&
                    ev.date && !isNaN(new Date(ev.date).getTime())
                );
                
                if (validEvents.length === 0) {
                    this.showNotification('Нет допустимых событий в файле', 'error');
                    return;
                }
                
                // Save all valid events
                for (const event of validEvents) {
                    await this.saveEvent(event);
                }
                
                await this.loadEvents();
                this.showNotification(`Импортировано событий: ${validEvents.length}`, 'success');
                
            } catch (err) {
                console.error('Ошибка импорта:', err);
                this.showNotification('Неверный формат файла', 'error');
            }
        };
        
        document.body.appendChild(input);
        input.click();
        setTimeout(() => document.body.removeChild(input), 1000);
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        let icon = '';
        switch (type) {
            case 'success':
                icon = '<svg viewBox="0 0 24 24"><path fill="#36f1b3" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>';
                break;
            case 'error':
                icon = '<svg viewBox="0 0 24 24"><path fill="#ff6b6b" d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>';
                break;
            default:
                icon = '<svg viewBox="0 0 24 24"><path fill="#36bff1" d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>';
                break;
        }
        
        notification.innerHTML = `${icon} ${message}`;
        notification.className = `notification ${type} show`;
        
        if (notification.timeoutId) {
            clearTimeout(notification.timeoutId);
        }
        
        notification.timeoutId = setTimeout(() => {
            notification.classList.remove('show');
            notification.timeoutId = null;
        }, 3000);
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('Service Worker зарегистрирован:', registration);
                    
                    // Check for updates
                    registration.update();
                    
                    // Listen for new SW
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        window.location.reload();
                    });
                })
                .catch(err => {
                    console.error('Ошибка регистрации Service Worker:', err);
                    this.showNotification('Ошибка регистрации сервис-воркера', 'error');
                });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.eternalFlowAppInstance = new EternalFlowApp();
});