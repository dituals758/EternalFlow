class EternalFlowApp {
    constructor() {
        this.config = {
            DB_NAME: 'EternalFlowDB',
            DB_VERSION: 3,
            MAX_TITLE_LENGTH: 50
        };

        this.events = [];
        this.editingEventId = null;
        this.filter = 'all';
        this.sort = 'date-asc';
        this.searchQuery = '';
        this.timerInterval = null;
        this.db = null;

        this.init();
    }

    async init() {
        try {
            await this.openDB();
            await this.loadEvents();
            this.setupEventListeners();
            this.startTimers();
            this.renderEvents();
            this.checkNewVersion();
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showNotification('Ошибка инициализации приложения', 'error');
        }
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.config.DB_NAME, this.config.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => {
                this.db = event.target.result;
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
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    }

    async loadEvents() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction(['events'], 'readonly');
            const store = transaction.objectStore('events');
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.events = request.result;
                resolve();
            };
        });
    }

    setupEventListeners() {
        // Кнопки добавления/закрытия события
        document.getElementById('openEventFormBtn').addEventListener('click', () => this.openEventForm());
        document.getElementById('closeEventModal').addEventListener('click', () => this.closeEventForm());
        
        // Сохранение события
        document.getElementById('saveEventBtn').addEventListener('click', () => this.handleSaveEvent());
        
        // Фильтры и поиск
        document.getElementById('searchToggle').addEventListener('click', () => this.toggleSearch());
        document.getElementById('closeSearch').addEventListener('click', () => this.toggleSearch());
        document.getElementById('searchInput').addEventListener('input', (e) => this.handleSearch(e));
        
        document.getElementById('filterToggle').addEventListener('click', () => this.openFilterModal());
        document.getElementById('closeFilterModal').addEventListener('click', () => this.closeFilterModal());
        document.getElementById('filterSelect').addEventListener('change', (e) => this.handleFilterChange(e));
        document.getElementById('sortSelect').addEventListener('change', (e) => this.handleSortChange(e));
        
        // Утилиты
        document.getElementById('exportBtn').addEventListener('click', () => this.exportEvents());
        document.getElementById('importBtn').addEventListener('click', () => this.importEvents());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAllEvents());

        // Закрытие модальных окон по клику вне области
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });

        // Ограничение длины заголовка
        document.getElementById('eventTitle').addEventListener('input', (e) => {
            if (e.target.value.length > this.config.MAX_TITLE_LENGTH) {
                e.target.value = e.target.value.slice(0, this.config.MAX_TITLE_LENGTH);
            }
        });
    }

    startTimers() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => this.updateAllTimers(), 1000);
    }

    formatTimeDifference(timestamp) {
        const now = Date.now();
        const diff = Math.abs(timestamp - now);
        const isFuture = timestamp > now;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            const years = Math.floor(days / 365);
            const months = Math.floor((days % 365) / 30);
            const weeks = Math.floor((days % 365 % 30) / 7);
            const remainingDays = days % 365 % 30 % 7;
            
            const parts = [];
            if (years > 0) parts.push(this.formatTimePart(years, ['год', 'года', 'лет']));
            if (months > 0) parts.push(this.formatTimePart(months, ['месяц', 'месяца', 'месяцев']));
            if (weeks > 0) parts.push(this.formatTimePart(weeks, ['неделя', 'недели', 'недель']));
            if (remainingDays > 0) parts.push(this.formatTimePart(remainingDays, ['день', 'дня', 'дней']));
            
            return isFuture ? `Через ${parts.join(' ')}` : `${parts.join(' ')} назад`;
        } else if (hours > 0) {
            const remainingMinutes = minutes % 60;
            const parts = [this.formatTimePart(hours, ['час', 'часа', 'часов'])];
            if (remainingMinutes > 0) parts.push(this.formatTimePart(remainingMinutes, ['минуту', 'минуты', 'минут']));
            return isFuture ? `Через ${parts.join(' ')}` : `${parts.join(' ')} назад`;
        } else if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            const parts = [this.formatTimePart(minutes, ['минуту', 'минуты', 'минут'])];
            if (remainingSeconds > 0) parts.push(this.formatTimePart(remainingSeconds, ['секунду', 'секунды', 'секунд']));
            return isFuture ? `Через ${parts.join(' ')}` : `${parts.join(' ')} назад`;
        } else {
            return isFuture ? `Через ${this.formatTimePart(seconds, ['секунду', 'секунды', 'секунд'])}` : 
                            `${this.formatTimePart(seconds, ['секунду', 'секунды', 'секунд'])} назад`;
        }
    }

    formatTimePart(value, forms) {
        value = Math.abs(value);
        let formIndex;
        
        if (value % 10 === 1 && value % 100 !== 11) {
            formIndex = 0;
        } else if ([2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100)) {
            formIndex = 1;
        } else {
            formIndex = 2;
        }
        
        return `${value} ${forms[formIndex]}`;
    }

    renderEvents() {
        const container = document.getElementById('eventsContainer');
        let filteredEvents = this.events;

        // Применяем фильтр
        if (this.filter === 'upcoming') {
            filteredEvents = filteredEvents.filter(event => event.date > Date.now());
        } else if (this.filter === 'past') {
            filteredEvents = filteredEvents.filter(event => event.date <= Date.now());
        }

        // Применяем поиск
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filteredEvents = filteredEvents.filter(event => 
                event.title.toLowerCase().includes(query)
            );
        }

        // Применяем сортировку
        filteredEvents.sort((a, b) => {
            switch (this.sort) {
                case 'date-desc':
                    return b.date - a.date;
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                case 'title-desc':
                    return b.title.localeCompare(a.title);
                default: // date-asc
                    return a.date - b.date;
            }
        });

        // Рендерим события
        if (filteredEvents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>📋</p>
                    <p>${this.searchQuery ? 'По вашему запросу ничего не найдено' : 'Событий пока нет'}</p>
                    ${this.searchQuery ? '<button class="clear-search-btn" id="clearSearchBtn">Очистить поиск</button>' : ''}
                </div>
            `;
            
            if (this.searchQuery) {
                document.getElementById('clearSearchBtn').addEventListener('click', () => {
                    this.searchQuery = '';
                    document.getElementById('searchInput').value = '';
                    this.renderEvents();
                });
            }
        } else {
            container.innerHTML = filteredEvents.map(event => this.createEventCard(event)).join('');
            
            // Добавляем обработчики для кнопок редактирования/удаления
            filteredEvents.forEach(event => {
                document.getElementById(`edit-${event.id}`).addEventListener('click', () => this.editEvent(event.id));
                document.getElementById(`delete-${event.id}`).addEventListener('click', () => this.deleteEvent(event.id));
            });
        }
    }

    createEventCard(event) {
        const isFuture = event.date > Date.now();
        const timeText = this.formatTimeDifference(event.date);
        const statusClass = isFuture ? 'future' : 'past';
        const statusText = isFuture ? 'Предстоящее' : 'Прошедшее';
        
        return `
            <div class="event-card ${statusClass}" data-id="${event.id}">
                <div class="event-header">
                    <div class="event-title" title="${event.title}">${event.title}</div>
                    <div class="event-status">${statusText}</div>
                </div>
                
                <div class="event-date">${new Date(event.date).toLocaleDateString('ru-RU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}</div>
                
                <div class="event-time-display">${timeText}</div>
                
                <div class="event-actions">
                    <button id="edit-${event.id}" class="edit-btn" title="Редактировать">✏️</button>
                    <button id="delete-${event.id}" class="delete-btn" title="Удалить">🗑️</button>
                </div>
            </div>
        `;
    }

    updateAllTimers() {
        const eventCards = document.querySelectorAll('.event-card');
        
        eventCards.forEach(card => {
            const id = parseInt(card.dataset.id);
            const event = this.events.find(e => e.id === id);
            
            if (!event) return;
            
            const timeElement = card.querySelector('.event-time-display');
            if (timeElement) {
                timeElement.textContent = this.formatTimeDifference(event.date);
            }
        });
    }

    openEventForm() {
        this.editingEventId = null;
        document.getElementById('modalTitle').textContent = 'Новое событие';
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDate').value = '';
        document.getElementById('eventTitleCounter').textContent = `0/${this.config.MAX_TITLE_LENGTH}`;
        document.getElementById('eventModal').classList.add('show');
        document.getElementById('eventTitle').focus();
    }

    closeEventForm() {
        document.getElementById('eventModal').classList.remove('show');
    }

    async handleSaveEvent() {
        const title = document.getElementById('eventTitle').value.trim();
        const dateInput = document.getElementById('eventDate').value;
        
        if (!dateInput) {
            this.showNotification('Укажите дату и время события', 'error');
            return;
        }
        
        const date = new Date(dateInput).getTime();

        if (!title) {
            this.showNotification('Введите название события', 'error');
            return;
        }

        if (date <= Date.now() - 60000) { // Минута допуска для прошедших событий
            if (!confirm('Вы добавляете событие в прошлом. Продолжить?')) {
                return;
            }
        }

        try {
            if (this.editingEventId) {
                await this.updateEvent(this.editingEventId, { title, date });
            } else {
                await this.addEvent(title, date);
            }

            this.closeEventForm();
            await this.loadEvents();
            this.renderEvents();
        } catch (error) {
            console.error('Error saving event:', error);
            this.showNotification('Ошибка сохранения события', 'error');
        }
    }

    async addEvent(title, date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const event = {
                title,
                date,
                createdAt: Date.now()
            };
            
            const request = store.add(event);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.showNotification('Событие добавлено', 'success');
                resolve();
            };
        });
    }

    editEvent(id) {
        const event = this.events.find(e => e.id === id);
        if (!event) return;

        this.editingEventId = id;
        document.getElementById('modalTitle').textContent = 'Редактировать событие';
        document.getElementById('eventTitle').value = event.title;
        document.getElementById('eventTitleCounter').textContent = `${event.title.length}/${this.config.MAX_TITLE_LENGTH}`;
        
        const date = new Date(event.date);
        const formattedDate = date.toISOString().slice(0, 16);
        document.getElementById('eventDate').value = formattedDate;
        
        document.getElementById('eventModal').classList.add('show');
        document.getElementById('eventTitle').focus();
    }

    async updateEvent(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            const request = store.get(id);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const event = request.result;
                Object.assign(event, updates);
                
                const putRequest = store.put(event);
                putRequest.onerror = () => reject(putRequest.error);
                putRequest.onsuccess = () => {
                    this.showNotification('Событие обновлено', 'success');
                    resolve();
                };
            };
        });
    }

    async deleteEvent(id) {
        if (!confirm('Удалить это событие?')) return;

        try {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            await store.delete(id);
            
            this.showNotification('Событие удалено', 'success');
            await this.loadEvents();
            this.renderEvents();
        } catch (error) {
            console.error('Error deleting event:', error);
            this.showNotification('Ошибка при удалении', 'error');
        }
    }

    async clearAllEvents() {
        if (!confirm('Очистить все события? Это действие нельзя отменить.')) return;

        try {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            await store.clear();
            
            this.events = [];
            this.showNotification('Все события удалены', 'success');
            this.renderEvents();
        } catch (error) {
            console.error('Error clearing events:', error);
            this.showNotification('Ошибка при очистке', 'error');
        }
    }

    toggleSearch() {
        const searchExpanded = document.getElementById('searchExpanded');
        const isExpanded = searchExpanded.style.display === 'block';
        
        searchExpanded.style.display = isExpanded ? 'none' : 'block';
        
        if (!isExpanded) {
            document.getElementById('searchInput').focus();
        } else {
            this.searchQuery = '';
            document.getElementById('searchInput').value = '';
            this.renderEvents();
        }
    }

    handleSearch(e) {
        this.searchQuery = e.target.value;
        this.renderEvents();
    }

    openFilterModal() {
        document.getElementById('filterSelect').value = this.filter;
        document.getElementById('sortSelect').value = this.sort;
        document.getElementById('filterModal').classList.add('show');
    }

    closeFilterModal() {
        document.getElementById('filterModal').classList.remove('show');
    }

    handleFilterChange(e) {
        this.filter = e.target.value;
        this.renderEvents();
        this.closeFilterModal();
    }

    handleSortChange(e) {
        this.sort = e.target.value;
        this.renderEvents();
        this.closeFilterModal();
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    exportEvents() {
        if (this.events.length === 0) {
            this.showNotification('Нет событий для экспорта', 'info');
            return;
        }

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
                    
                    const validEvents = importedEvents.filter(event => 
                        event && typeof event.title === 'string' && typeof event.date === 'number'
                    );
                    
                    if (validEvents.length === 0) {
                        throw new Error('No valid events found in file');
                    }
                    
                    if (confirm(`Найдено ${validEvents.length} событий для импорта. Продолжить?`)) {
                        this.performImport(validEvents);
                    }
                } catch (error) {
                    console.error('Error importing events:', error);
                    this.showNotification('Ошибка импорта: неверный формат файла', 'error');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }

    async performImport(eventsToImport) {
        try {
            const transaction = this.db.transaction(['events'], 'readwrite');
            const store = transaction.objectStore('events');
            
            for (const event of eventsToImport) {
                await new Promise((resolve, reject) => {
                    const request = store.add({
                        title: event.title,
                        date: event.date,
                        createdAt: event.createdAt || Date.now()
                    });
                    
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
            
            await this.loadEvents();
            this.showNotification(`Импортировано ${eventsToImport.length} событий`, 'success');
            this.renderEvents();
        } catch (error) {
            console.error('Error importing events:', error);
            this.showNotification('Ошибка импорта событий', 'error');
        }
    }

    checkNewVersion() {
        const lastVersion = localStorage.getItem('eternalFlowVersion');
        if (!lastVersion || lastVersion !== '1.4.0') {
            this.showNotification('EternalFlow обновлен до версии 1.4.0!', 'info');
            localStorage.setItem('eternalFlowVersion', '1.4.0');
        }
    }
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    new EternalFlowApp();
    
    // Регистрация Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    }
});