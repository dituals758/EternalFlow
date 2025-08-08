export class EternalFlowApp {
    constructor() {
        this.config = {
            APP_VERSION: '1.6',
            STORAGE_KEY: 'liuguangForeverEvents',
            TIME_UNITS: [
                { name: 'years', divisor: 31536000000, labels: ['лет', 'года', 'год'] },
                { name: 'months', divisor: 2628000000, labels: ['месяцев', 'месяца', 'месяц'] },
                { name: 'days', divisor: 86400000, labels: ['дней', 'дня', 'день'] },
                { name: 'hours', divisor: 3600000, labels: ['часов', 'часа', 'час'] },
                { name: 'minutes', divisor: 60000, labels: ['минут', 'минуты', 'минута'] },
                { name: 'seconds', divisor: 1000, labels: ['секунд', 'секунды', 'секунда'] }
            ],
            MAX_FILE_SIZE: 2 * 1024 * 1024
        };
        this.events = [];
        this.deferredPrompt = null;
        this.timerUpdateInterval = null;
        this.init();
    }

    init() {
        this.createParticles();
        this.loadEvents();
        this.setupEventListeners();
        this.startTimers();
        this.setCurrentDateTime();
        this.setupServiceWorker();
        this.setupInstallPrompt();
        this.setAppVersion();
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
        
        const particleCount = 20;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            
            const size = Math.random() * 4 + 1;
            const posX = Math.random() * 100;
            const posY = Math.random() * 100;
            const duration = Math.random() * 10 + 10;
            const delay = Math.random() * 5;
            const hue = Math.random() * 360;
            
            particle.style.cssText = `
                width: ${size}px;
                height: ${size}px;
                left: ${posX}%;
                top: ${posY}%;
                background: hsla(${hue}, 80%, 70%, ${Math.random() * 0.2 + 0.05});
                animation-duration: ${duration}s;
                animation-delay: ${delay}s;
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

    loadEvents() {
        try {
            const stored = localStorage.getItem(this.config.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    this.events = parsed.filter(e => 
                        e.id && e.title && e.date && !isNaN(new Date(e.date).getTime())
                    );
                }
            }
        } catch (err) {
            console.error('Ошибка загрузки данных', err);
            this.showNotification('Ошибка загрузки данных', 'error');
            this.events = [];
        }
        this.renderEvents();
    }

    saveEvents() {
        try {
            localStorage.setItem(this.config.STORAGE_KEY, JSON.stringify(this.events));
        } catch (err) {
            console.error('Ошибка сохранения событий', err);
            this.showNotification('Ошибка сохранения данных', 'error');
        }
    }

    setupEventListeners() {
        const saveBtn = document.getElementById('saveEventBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveEvent());
        }
        
        const titleInput = document.getElementById('eventTitle');
        if (titleInput) {
            titleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.saveEvent();
            });
        }
        
        const importBtn = document.getElementById('importBtn');
        const exportBtn = document.getElementById('exportBtn');
        
        if (importBtn) importBtn.addEventListener('click', () => this.importEvents());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportEvents());
    }

    saveEvent() {
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
        
        this.addEvent({
            id: Date.now().toString(),
            title,
            date: targetDate.toISOString()
        });
        
        if (titleInput) titleInput.value = '';
        this.setCurrentDateTime();
        if (titleInput) titleInput.focus();
        this.showNotification('Событие добавлено', 'success');
    }

    addEvent(event) {
        this.events.push(event);
        this.saveEvents();
        this.renderEvents();
    }

    deleteEvent(eventId) {
        this.showDeleteConfirmation(eventId);
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
        
        document.getElementById('confirmDelete').addEventListener('click', () => {
            this.events = this.events.filter(e => e.id !== eventId);
            this.saveEvents();
            this.renderEvents();
            this.showNotification('Событие удалено', 'success');
            modal.remove();
        });
        
        document.getElementById('cancelDelete').addEventListener('click', () => {
            modal.remove();
        });
    }

    renderEvents() {
        const container = document.getElementById('eventsContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.events.length === 0) {
            container.innerHTML = `
                <div class="empty-state" aria-label="Нет событий">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--accent)" d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z"/></svg>
                    <p>Нет событий</p>
                    <p>Добавьте события для отслеживания</p>
                </div>
            `;
            return;
        }
        
        const sortedEvents = [...this.events].sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );
        
        sortedEvents.forEach(event => {
            const card = document.createElement('div');
            card.className = 'event-card';
            card.innerHTML = `
                <div class="event-header">
                    <div class="event-title">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14,12L10,8V11H2V13H10V16M20,18V6C20,4.89 19.1,4 18,4H6A2,2 0 0,0 4,6V18A2,2 0 0,0 6,20H18A2,2 0 0,0 20,18Z"/></svg>
                        ${this.escapeHTML(event.title)}
                    </div>
                    <div class="event-date" aria-label="Дата события">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z"/></svg>
                        ${this.formatDate(new Date(event.date))}
                    </div>
                </div>
                <div class="time-grid" id="timer-${event.id}">
                    <!-- Таймер будет обновлен отдельно -->
                </div>
                <button class="delete-btn" data-id="${event.id}" aria-label="Удалить событие">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                    </svg>
                </button>
            `;
            
            container.appendChild(card);
            
            const delBtn = card.querySelector('.delete-btn');
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    const eventId = delBtn.dataset.id;
                    this.deleteEvent(eventId);
                });
            }
        });
    }

    startTimers() {
        if (this.timerUpdateInterval) {
            clearInterval(this.timerUpdateInterval);
        }
        
        this.updateAllTimers();
        
        this.timerUpdateInterval = setInterval(() => {
            this.updateAllTimers();
        }, 1000);
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
        let timerHTML = '';
        
        if (isPast) {
            timerHTML += `
                <div class="time-unit" style="grid-column: 1 / -1; text-align: center; background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3);">
                    <div class="time-value" style="background: linear-gradient(135deg, var(--danger), var(--warning));">Прошло:</div>
                </div>
            `;
        }
        
        for (const unit of this.config.TIME_UNITS) {
            const value = timeValues[unit.name];
            if (value > 0 || hasNonZero) {
                hasNonZero = true;
                const label = this.getCorrectLabel(value, unit.labels);
                timerHTML += `
                    <div class="time-unit" aria-label="${value} ${label}">
                        <div class="time-value">${value}</div>
                        <div class="time-label">${label}</div>
                    </div>
                `;
            }
        }
        
        container.innerHTML = timerHTML;
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

    exportEvents() {
        try {
            if (this.events.length === 0) {
                this.showNotification('Нет событий для экспорта', 'info');
                return;
            }
            
            const dataStr = JSON.stringify(this.events, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const exportFileDefaultName = `ВечныйПоток_${new Date().toISOString().slice(0, 10)}.json`;
            
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

    importEvents() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > this.config.MAX_FILE_SIZE) {
                this.showNotification('Файл слишком большой (макс. 2MB)', 'error');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const events = JSON.parse(event.target.result);
                    if (!Array.isArray(events)) throw new Error('Неверный формат');
                    
                    const validEvents = events.filter(ev =>
                        ev.id && typeof ev.id === 'string' &&
                        ev.title && typeof ev.title === 'string' &&
                        ev.title.length <= 50 &&
                        ev.date && !isNaN(new Date(ev.date).getTime())
                    );
                    
                    if (validEvents.length === 0) {
                        this.showNotification('Нет допустимых событий в файле', 'error');
                        return;
                    }
                    
                    this.events = validEvents;
                    this.saveEvents();
                    this.renderEvents();
                    this.showNotification(`Импортировано событий: ${validEvents.length}`, 'success');
                    
                } catch (err) {
                    console.error('Ошибка импорта:', err);
                    this.showNotification('Неверный формат файла', 'error');
                }
            };
            
            reader.onerror = () => {
                this.showNotification('Ошибка чтения файла', 'error');
            };
            
            reader.readAsText(file);
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
                icon = '<svg viewBox="0 0 24 24"><path fill="var(--success)" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>';
                break;
            case 'error':
                icon = '<svg viewBox="0 0 24 24"><path fill="var(--danger)" d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>';
                break;
            default:
                icon = '<svg viewBox="0 0 24 24"><path fill="var(--primary)" d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>';
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