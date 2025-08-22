export class EternalFlowApp {
    constructor() {
        this.config = {
            APP_VERSION: '1.2.0',
            DB_NAME: 'EternalFlowDB',
            DB_VERSION: 3,
            TIME_UNITS: [
                { name: 'years', divisor: 31536000000, labels: ['лет', 'года', 'год'] },
                { name: 'months', divisor: 2628000000, labels: ['месяцев', 'месяца', 'месяц'] },
                { name: 'days', divisor: 86400000, labels: ['дней', 'дня', 'день'] },
                { name: 'hours', divisor: 3600000, labels: ['часов', 'часа', 'час'] },
                { name: 'minutes', divisor: 60000, labels: ['минут', 'минуты', 'минута'] },
                { name: 'seconds', divisor: 1000, labels: ['секунд', 'секунды', 'секунда'] }
            ],
            MAX_EVENTS: 200,
            VISIBLE_EVENTS: 10
        };

        this.events = [];
        this.deferredPrompt = null;
        this.timerUpdateInterval = null;
        this.editingEventId = null;
        this.filter = 'all';
        this.sort = 'date-asc';
        this.searchQuery = '';
        this.db = null;
        this.visibleEvents = this.config.VISIBLE_EVENTS;
        this.searchExpanded = false;

        this.init();
    }

    async init() {
        try {
            await this.initDB();
            await this.loadEvents();
            await this.loadSettings();
            
            this.createParticles();
            this.setupEventListeners();
            this.startTimers();
            this.setCurrentDateTime();
            this.setupServiceWorker();
            this.setupInstallPrompt();
            this.setAppVersion();
            this.setupModal();
            this.setupScrollHide();
            this.setupInfiniteScroll();
            this.setupNetworkStatus();
            
            this.renderEvents();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showNotification('Ошибка инициализации приложения', 'error');
        }
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.config.DB_NAME, this.config.DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('events')) {
                    const store = db.createObjectStore('events', { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    store.createIndex('date', 'date', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    const store = db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async loadEvents() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const request = store.getAll();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.events = request.result || [];
                resolve();
            };
        });
    }

    async loadSettings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.getAll();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const settings = request.result || [];
                settings.forEach(setting => {
                    if (setting.key === 'filter') this.filter = setting.value;
                    if (setting.key === 'sort') this.sort = setting.value;
                });
                
                // Update UI elements
                if (document.getElementById('filterSelect')) {
                    document.getElementById('filterSelect').value = this.filter;
                }
                if (document.getElementById('sortSelect')) {
                    document.getElementById('sortSelect').value = this.sort;
                }
                
                resolve();
            };
        });
    }

    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    createParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;
        
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.cssText = `
                width: ${Math.random() * 3 + 1}px;
                height: ${Math.random() * 3 + 1}px;
                background: rgba(41, 182, 246, ${Math.random() * 0.3 + 0.1});
                top: ${Math.random() * 100}vh;
                left: ${Math.random() * 100}vw;
                animation-duration: ${Math.random() * 20 + 10}s;
                animation-delay: ${Math.random() * 5}s;
            `;
            particlesContainer.appendChild(particle);
        }
    }

    setupEventListeners() {
        // Save event button
        document.getElementById('saveEventBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.saveEventForm();
        });

        // Title input enter key
        document.getElementById('eventTitle')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveEventForm();
        });

        // Action buttons
        document.getElementById('importBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.importEvents();
        });
        
        document.getElementById('exportBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.exportEvents();
        });
        
        document.getElementById('clearBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showClearConfirmation();
        });
        
        document.getElementById('openEventFormBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openEventModal();
        });

        // Filter and sort
        document.getElementById('filterSelect')?.addEventListener('change', async (e) => {
            this.filter = e.target.value;
            await this.saveSetting('filter', this.filter);
            this.visibleEvents = this.config.VISIBLE_EVENTS;
            this.renderEvents();
        });

        document.getElementById('sortSelect')?.addEventListener('change', async (e) => {
            this.sort = e.target.value;
            await this.saveSetting('sort', this.sort);
            this.visibleEvents = this.config.VISIBLE_EVENTS;
            this.renderEvents();
        });

        // Search functionality
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.visibleEvents = this.config.VISIBLE_EVENTS;
            this.renderEvents();
        });

        // Escape key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('eventModal');
                if (modal?.classList.contains('show')) {
                    modal.classList.remove('show');
                    this.editingEventId = null;
                    this.resetForm();
                }
                
                const filterModal = document.getElementById('filterModal');
                if (filterModal?.classList.contains('show')) {
                    filterModal.classList.remove('show');
                }
                
                if (this.searchExpanded) {
                    this.toggleSearch(false);
                }
            }
        });
        
        // Search toggle
        document.getElementById('searchToggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleSearch(!this.searchExpanded);
        });

        // Close search
        document.getElementById('closeSearch')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleSearch(false);
            this.searchQuery = '';
            document.getElementById('searchInput').value = '';
            this.renderEvents();
        });

        // Filter toggle
        document.getElementById('filterToggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('filterModal').classList.add('show');
        });

        // Close filter modal
        document.getElementById('closeFilterModal')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('filterModal').classList.remove('show');
        });

        // Modal click outside
        document.getElementById('filterModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('filterModal')) {
                document.getElementById('filterModal').classList.remove('show');
            }
        });

        // Close event modal
        document.getElementById('closeEventModal')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('eventModal').classList.remove('show');
            this.editingEventId = null;
            this.resetForm();
        });

        // Event modal click outside
        document.getElementById('eventModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('eventModal')) {
                document.getElementById('eventModal').classList.remove('show');
                this.editingEventId = null;
                this.resetForm();
            }
        });
    }

    toggleSearch(state) {
        this.searchExpanded = state;
        const searchExpanded = document.getElementById('searchExpanded');
        if (searchExpanded) {
            searchExpanded.style.display = state ? 'block' : 'none';
            
            if (state) {
                setTimeout(() => {
                    document.getElementById('searchInput')?.focus();
                }, 100);
            }
        }
    }

    setCurrentDateTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        document.getElementById('eventDate').value = localDateTime;
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then((registration) => {
                    console.log('SW registered: ', registration);
                })
                .catch((registrationError) => {
                    console.log('SW registration failed: ', registrationError);
                });
        }
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            
            const dynamicIsland = document.getElementById('dynamicIsland');
            if (dynamicIsland) {
                dynamicIsland.style.display = 'flex';
                
                dynamicIsland.addEventListener('click', () => {
                    this.deferredPrompt.prompt();
                    this.deferredPrompt.userChoice.then((choiceResult) => {
                        if (choiceResult.outcome === 'accepted') {
                            dynamicIsland.style.display = 'none';
                        }
                        this.deferredPrompt = null;
                    });
                });
            }
        });
    }

    setAppVersion() {
        const versionElements = document.querySelectorAll('.app-version');
        versionElements.forEach(el => {
            el.textContent = `v${this.config.APP_VERSION}`;
        });
    }

    setupModal() {
        // Already handled in setupEventListeners
    }

    setupScrollHide() {
        let lastScrollTop = 0;
        const header = document.querySelector('.app-header');
        
        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > lastScrollTop && scrollTop > 100) {
                header.style.transform = 'translateY(-100%)';
                header.style.opacity = '0';
            } else {
                header.style.transform = 'translateY(0)';
                header.style.opacity = '1';
            }
            
            lastScrollTop = scrollTop;
        }, { passive: true });
    }

    setupInfiniteScroll() {
        const eventsContainer = document.getElementById('eventsContainer');
        if (!eventsContainer) return;
        
        eventsContainer.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = eventsContainer;
            
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                this.visibleEvents += this.config.VISIBLE_EVENTS;
                this.renderEvents();
            }
        }, { passive: true });
    }

    setupNetworkStatus() {
        window.addEventListener('online', () => {
            this.showNotification('Соединение восстановлено', 'success');
        });

        window.addEventListener('offline', () => {
            this.showNotification('Отсутствует интернет-соединение', 'error');
        });
    }

    openEventModal(event = null) {
        const modal = document.getElementById('eventModal');
        const modalTitle = document.getElementById('modalTitle');
        
        if (event) {
            // Editing existing event
            modalTitle.textContent = 'Редактировать событие';
            this.editingEventId = event.id;
            document.getElementById('eventTitle').value = event.title;
            document.getElementById('eventDate').value = new Date(event.date).toISOString().slice(0, 16);
        } else {
            // Creating new event
            modalTitle.textContent = 'Новое событие';
            this.editingEventId = null;
            this.resetForm();
        }
        
        modal.classList.add('show');
        document.getElementById('eventTitle').focus();
    }

    resetForm() {
        document.getElementById('eventTitle').value = '';
        this.setCurrentDateTime();
    }

    async saveEventForm() {
        const titleInput = document.getElementById('eventTitle');
        const dateInput = document.getElementById('eventDate');
        
        const title = titleInput.value.trim();
        const date = new Date(dateInput.value).getTime();
        
        if (!title) {
            this.showNotification('Введите название события', 'error');
            titleInput.focus();
            return;
        }
        
        if (!date || isNaN(date)) {
            this.showNotification('Укажите корректную дату и время', 'error');
            dateInput.focus();
            return;
        }
        
        try {
            if (this.editingEventId) {
                // Update existing event
                await this.updateEvent(this.editingEventId, { title, date });
                this.showNotification('Событие обновлено', 'success');
            } else {
                // Create new event
                await this.addEvent({ title, date });
                this.showNotification('Событие добавлено', 'success');
            }
            
            document.getElementById('eventModal').classList.remove('show');
            this.editingEventId = null;
            this.resetForm();
            this.renderEvents();
        } catch (error) {
            console.error('Error saving event:', error);
            this.showNotification('Ошибка сохранения события', 'error');
        }
    }

    async addEvent(eventData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const event = {
                ...eventData,
                createdAt: Date.now()
            };
            
            const request = store.add(event);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.events.push({ ...event, id: request.result });
                resolve();
            };
        });
    }

    async updateEvent(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const getRequest = store.get(id);
            getRequest.onerror = () => reject(getRequest.error);
            getRequest.onsuccess = () => {
                const event = getRequest.result;
                if (!event) {
                    reject(new Error('Event not found'));
                    return;
                }
                
                const updatedEvent = { ...event, ...updates };
                const putRequest = store.put(updatedEvent);
                
                putRequest.onerror = () => reject(putRequest.error);
                putRequest.onsuccess = () => {
                    const index = this.events.findIndex(e => e.id === id);
                    if (index !== -1) {
                        this.events[index] = updatedEvent;
                    }
                    resolve();
                };
            };
        });
    }

    async deleteEvent(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const request = store.delete(id);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.events = this.events.filter(event => event.id !== id);
                resolve();
            };
        });
    }

    async clearAllEvents() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const request = store.clear();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.events = [];
                resolve();
            };
        });
    }

    showClearConfirmation() {
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Очистить все события?</h3>
                <p>Это действие нельзя отменить. Все ваши события будут удалены.</p>
                <div class="modal-buttons">
                    <button class="btn danger" id="confirmClear">Очистить</button>
                    <button class="btn" id="cancelClear">Отмена</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        document.getElementById('confirmClear').addEventListener('click', async () => {
            try {
                await this.clearAllEvents();
                this.showNotification('Все события удалены', 'success');
                this.renderEvents();
            } catch (error) {
                console.error('Error clearing events:', error);
                this.showNotification('Ошибка удаления событий', 'error');
            }
            modal.remove();
        });
        
        document.getElementById('cancelClear').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    renderEvents() {
        const container = document.getElementById('eventsContainer');
        if (!container) return;
        
        // Filter events
        let filteredEvents = this.events.filter(event => {
            const matchesSearch = event.title.toLowerCase().includes(this.searchQuery);
            const isFuture = event.date > Date.now();
            
            if (this.filter === 'upcoming') return matchesSearch && isFuture;
            if (this.filter === 'past') return matchesSearch && !isFuture;
            return matchesSearch;
        });
        
        // Sort events
        filteredEvents.sort((a, b) => {
            switch (this.sort) {
                case 'date-desc':
                    return b.date - a.date;
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                case 'title-desc':
                    return b.title.localeCompare(a.title);
                case 'added-asc':
                    return a.createdAt - b.createdAt;
                case 'added-desc':
                    return b.createdAt - a.createdAt;
                default: // date-asc
                    return a.date - b.date;
            }
        });
        
        // Limit visible events
        const eventsToShow = filteredEvents.slice(0, this.visibleEvents);
        
        if (eventsToShow.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6Z" />
                    </svg>
                    <p>${this.searchQuery ? 'События не найдены' : 'Событий пока нет'}</p>
                    <p>${this.searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первое событие'}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = eventsToShow.map(event => this.createEventCard(event)).join('');
        
        // Add event listeners to action buttons
        eventsToShow.forEach(event => {
            const editBtn = document.getElementById(`edit-${event.id}`);
            const deleteBtn = document.getElementById(`delete-${event.id}`);
            
            if (editBtn) {
                editBtn.addEventListener('click', () => this.openEventModal(event));
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.deleteEventWithConfirmation(event.id));
            }
        });
    }

    createEventCard(event) {
        const isFuture = event.date > Date.now();
        const timeDiff = Math.abs(event.date - Date.now());
        const timeUnits = this.calculateTimeUnits(timeDiff);
        
        return `
            <div class="event-card" data-id="${event.id}">
                <div class="event-header">
                    <div class="event-title">
                        <svg class="status-icon ${isFuture ? 'status-future' : 'status-past'}" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor" d="${isFuture ? 'M11,4V8H4V4H11M12,4H21V8H12V4M12,9H21V13H12V9M12,14H21V18H12V14M4,11H11V21H4V11Z' : 'M10,4H14V6H10V4M10,8H14V10H10V8M10,12H14V20H10V12M16,4H20V6H16V4M16,8H20V10H16V8M16,12H20V20H16V12M4,4H8V20H4V4Z'}" />
                        </svg>
                        <span class="event-title-text" title="${event.title}">${event.title}</span>
                    </div>
                    <div class="event-date">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor" d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z" />
                        </svg>
                        ${new Date(event.date).toLocaleDateString('ru-RU')}
                    </div>
                </div>
                
                <div class="time-grid">
                    ${Object.entries(timeUnits).map(([unit, value]) => `
                        <div class="time-unit">
                            <div class="time-value">${value}</div>
                            <div class="time-label">${this.getUnitLabel(value, unit)}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="event-status">
                    <div class="status-text ${isFuture ? 'future' : 'past'}">
                        ${isFuture ? 'До события осталось' : 'Событие прошло'}
                    </div>
                </div>
                
                <div class="event-actions">
                    <button id="edit-${event.id}" class="edit-btn" aria-label="Редактировать событие">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
                        </svg>
                    </button>
                    <button id="delete-${event.id}" class="delete-btn" aria-label="Удалить событие">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    calculateTimeUnits(milliseconds) {
        const units = {};
        
        this.config.TIME_UNITS.forEach(unit => {
            const value = Math.floor(milliseconds / unit.divisor);
            milliseconds %= unit.divisor;
            units[unit.name] = value;
        });
        
        return units;
    }

    getUnitLabel(value, unitName) {
        const unit = this.config.TIME_UNITS.find(u => u.name === unitName);
        if (!unit) return unitName;
        
        const cases = [2, 0, 1, 1, 1, 2];
        const index = (value % 100 > 4 && value % 100 < 20) ? 
            2 : cases[Math.min(value % 10, 5)];
        
        return unit.labels[index];
    }

    deleteEventWithConfirmation(id) {
        const event = this.events.find(e => e.id === id);
        if (!event) return;
        
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Удалить событие?</h3>
                <p>Событие "${event.title}" будет удалено безвозвратно.</p>
                <div class="modal-buttons">
                    <button class="btn danger" id="confirmDelete">Удалить</button>
                    <button class="btn" id="cancelDelete">Отмена</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        document.getElementById('confirmDelete').addEventListener('click', async () => {
            try {
                await this.deleteEvent(id);
                this.showNotification('Событие удалено', 'success');
                this.renderEvents();
            } catch (error) {
                console.error('Error deleting event:', error);
                this.showNotification('Ошибка удаления события', 'error');
            }
            modal.remove();
        });
        
        document.getElementById('cancelDelete').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    startTimers() {
        // Clear existing interval if any
        if (this.timerUpdateInterval) {
            clearInterval(this.timerUpdateInterval);
        }
        
        // Update timers every second
        this.timerUpdateInterval = setInterval(() => {
            this.updateAllTimers();
        }, 1000);
    }

    updateAllTimers() {
        const eventCards = document.querySelectorAll('.event-card');
        
        eventCards.forEach(card => {
            const id = parseInt(card.dataset.id);
            const event = this.events.find(e => e.id === id);
            
            if (!event) return;
            
            const isFuture = event.date > Date.now();
            const timeDiff = Math.abs(event.date - Date.now());
            const timeUnits = this.calculateTimeUnits(timeDiff);
            
            // Update time values
            Object.entries(timeUnits).forEach(([unit, value]) => {
                const valueElement = card.querySelector(`.time-unit .time-value`);
                const labelElement = card.querySelector(`.time-unit .time-label`);
                
                if (valueElement && labelElement) {
                    valueElement.textContent = value;
                    labelElement.textContent = this.getUnitLabel(value, unit);
                }
            });
            
            // Update status text
            const statusElement = card.querySelector('.status-text');
            if (statusElement) {
                statusElement.textContent = isFuture ? 'До события осталось' : 'Событие прошло';
                statusElement.className = `status-text ${isFuture ? 'future' : 'past'}`;
            }
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    exportEvents() {
        const dataStr = JSON.stringify(this.events, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `EternalFlow-export-${new Date().toISOString().slice(0, 10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showNotification('События экспортированы', 'success');
    }

    importEvents() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedEvents = JSON.parse(event.target.result);
                    
                    if (!Array.isArray(importedEvents)) {
                        throw new Error('Invalid file format');
                    }
                    
                    // Validate each event
                    const validEvents = importedEvents.filter(event => 
                        event && typeof event.title === 'string' && typeof event.date === 'number'
                    );
                    
                    if (validEvents.length === 0) {
                        throw new Error('No valid events found in file');
                    }
                    
                    // Confirm import
                    this.showImportConfirmation(validEvents);
                } catch (error) {
                    console.error('Error importing events:', error);
                    this.showNotification('Ошибка импорта: неверный формат файла', 'error');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }

    showImportConfirmation(events) {
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Импорт событий</h3>
                <p>Найдено ${events.length} событий для импорта.</p>
                <p>Текущие события будут сохранены, новые будут добавлены.</p>
                <div class="modal-buttons">
                    <button class="btn primary" id="confirmImport">Импортировать</button>
                    <button class="btn" id="cancelImport">Отмена</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        document.getElementById('confirmImport').addEventListener('click', async () => {
            try {
                await this.performImport(events);
                this.showNotification(`Импортировано ${events.length} событий`, 'success');
                this.renderEvents();
            } catch (error) {
                console.error('Error importing events:', error);
                this.showNotification('Ошибка импорта событий', 'error');
            }
            modal.remove();
        });
        
        document.getElementById('cancelImport').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async performImport(eventsToImport) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            // Add all events
            let completed = 0;
            let errors = 0;
            
            eventsToImport.forEach(event => {
                const request = store.add({
                    title: event.title,
                    date: event.date,
                    createdAt: event.createdAt || Date.now()
                });
                
                request.onsuccess = () => {
                    this.events.push({ ...event, id: request.result });
                    completed++;
                    
                    if (completed + errors === eventsToImport.length) {
                        if (errors > 0) {
                            reject(new Error(`Failed to import ${errors} events`));
                        } else {
                            resolve();
                        }
                    }
                };
                
                request.onerror = () => {
                    errors++;
                    console.error('Error importing event:', request.error);
                    
                    if (completed + errors === eventsToImport.length) {
                        if (errors > 0) {
                            reject(new Error(`Failed to import ${errors} events`));
                        } else {
                            resolve();
                        }
                    }
                };
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.eternalFlowAppInstance = new EternalFlowApp();
});