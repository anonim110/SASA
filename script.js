// Инициализация данных
let users = JSON.parse(localStorage.getItem('users')) || [];
let posts = JSON.parse(localStorage.getItem('posts')) || [];
let currentUser = JSON.parse(localStorage.getItem('currentUser'));
let currentFilter = 'all';
let currentPostType = 'text';
let selectedMedia = null;

// DOM элементы
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const authButtons = document.querySelector('.auth-buttons');
const authForms = document.querySelector('.auth-forms');
const content = document.querySelector('.content');
const postsContainer = document.getElementById('postsContainer');
const currentUsernameSpan = document.getElementById('currentUsername');
const postCountSpan = document.getElementById('postCount');
const likeCountSpan = document.getElementById('likeCount');
const mediaInput = document.getElementById('mediaInput');
const postPreview = document.getElementById('postPreview');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');

// Обработчики событий
if (loginBtn) loginBtn.addEventListener('click', () => showAuthForm('login'));
if (registerBtn) registerBtn.addEventListener('click', () => showAuthForm('register'));
if (mediaInput) mediaInput.addEventListener('change', handleFileSelect);

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        showContent();
    } else {
        showAuthForms();
    }
});

// Функции авторизации
function showAuthForms() {
    const authForms = document.querySelector('.auth-forms');
    const content = document.querySelector('.content');
    const loginForm = document.querySelector('.login-form');
    const registerForm = document.querySelector('.register-form');
    
    if (authForms) authForms.style.display = 'block';
    if (content) content.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
}

function showContent() {
    const authForms = document.querySelector('.auth-forms');
    const content = document.querySelector('.content');
    const currentUsernameSpan = document.getElementById('currentUsername');
    
    if (authForms) authForms.style.display = 'none';
    if (content) content.style.display = 'block';
    if (currentUsernameSpan) currentUsernameSpan.textContent = currentUser.username;
    
    updateUserStats();
    displayPosts();
}

function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();

    if (!username || !email || !password) {
        showNotification('error', 'Пожалуйста, заполните все поля');
        return;
    }

    if (users.some(user => user.username === username)) {
        showNotification('error', 'Пользователь с таким именем уже существует');
        return;
    }

    const newUser = {
        username,
        email,
        password,
        posts: [],
        likes: 0,
        followers: 0,
        following: 0,
        joinDate: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    showNotification('success', 'Регистрация успешна!');
    showAuthForm('login');
}

function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        showContent();
        showNotification('success', `Добро пожаловать, ${username}!`);
    } else {
        showNotification('error', 'Неверное имя пользователя или пароль');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showAuthForms();
    showNotification('info', 'Вы вышли из системы');
}

// Функции для работы с постами
function setPostType(type) {
    currentPostType = type;
    const buttons = document.querySelectorAll('.btn-option');
    const mediaInput = document.getElementById('mediaInput');
    
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (type === 'text') {
        mediaInput.style.display = 'none';
    } else {
        mediaInput.style.display = 'block';
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const imagePreview = document.getElementById('imagePreview');
    const videoPreview = document.getElementById('videoPreview');
    const filePreview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');

    // Скрываем все превью
    imagePreview.style.display = 'none';
    videoPreview.style.display = 'none';
    filePreview.style.display = 'none';

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        videoPreview.src = URL.createObjectURL(file);
        videoPreview.style.display = 'block';
    } else {
        // Для других типов файлов показываем иконку и имя файла
        fileName.textContent = file.name;
        filePreview.style.display = 'flex';
    }
}

function createPost() {
    if (!currentUser) {
        showNotification('error', 'Пожалуйста, войдите в систему');
        return;
    }

    const content = document.getElementById('postContent').value.trim();
    if (!content) {
        showNotification('error', 'Пожалуйста, введите текст поста');
        return;
    }

    const mediaInput = document.getElementById('mediaInput');
    const mediaFile = mediaInput.files[0];
    let mediaUrl = '';
    let mediaType = '';

    if (mediaFile) {
        const reader = new FileReader();
        reader.onload = function(e) {
            mediaUrl = e.target.result;
            
            // Определяем тип файла
            if (mediaFile.type.startsWith('image/')) {
                mediaType = 'image';
            } else if (mediaFile.type.startsWith('video/')) {
                mediaType = 'video';
            } else {
                mediaType = 'file';
            }
            
            const post = {
                id: Date.now(),
                author: currentUser.username,
                content: content,
                mediaUrl: mediaUrl,
                mediaType: mediaType,
                fileName: mediaFile.name,
                fileType: mediaFile.type,
                likes: [],
                comments: [],
                date: new Date().toISOString()
            };

            posts.unshift(post);
            localStorage.setItem('posts', JSON.stringify(posts));

            // Очищаем форму
            document.getElementById('postContent').value = '';
            mediaInput.value = '';
            document.getElementById('imagePreview').style.display = 'none';
            document.getElementById('videoPreview').style.display = 'none';
            document.getElementById('filePreview').style.display = 'none';
            
            displayPosts();
            updateUserStats();
            showNotification('success', 'Пост успешно опубликован');
        };
        reader.readAsDataURL(mediaFile);
    } else {
        const post = {
            id: Date.now(),
            author: currentUser.username,
            content: content,
            mediaUrl: '',
            mediaType: '',
            likes: [],
            comments: [],
            date: new Date().toISOString()
        };

        posts.unshift(post);
        localStorage.setItem('posts', JSON.stringify(posts));

        // Очищаем форму
        document.getElementById('postContent').value = '';
        
        displayPosts();
        updateUserStats();
        showNotification('success', 'Пост успешно опубликован');
    }
}

function updateUserStats() {
    if (!currentUser) return;
    
    const userPosts = posts.filter(post => post.author === currentUser.username);
    const totalLikes = userPosts.reduce((sum, post) => sum + post.likes.length, 0);
    
    if (postCountSpan) postCountSpan.textContent = userPosts.length;
    if (likeCountSpan) likeCountSpan.textContent = totalLikes;
}

function filterPosts(type) {
    currentFilter = type;
    const buttons = document.querySelectorAll('.btn-filter');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    displayPosts();
}

function displayPosts() {
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    
    postsContainer.innerHTML = '';
    let filteredPosts = [...posts];
    
    switch(currentFilter) {
        case 'my':
            filteredPosts = posts.filter(post => post.author === currentUser.username);
            break;
        case 'popular':
            filteredPosts.sort((a, b) => b.likes.length - a.likes.length);
            break;
    }

    if (filteredPosts.length === 0) {
        postsContainer.innerHTML = '<div class="no-posts">Нет постов для отображения</div>';
        return;
    }

    filteredPosts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = 'post';
        postElement.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <i class="fas fa-user"></i>
                    ${post.author}
                </div>
                <div class="post-date">
                    <i class="far fa-clock"></i>
                    ${new Date(post.date).toLocaleString()}
                </div>
            </div>
            <div class="post-content">${post.content}</div>
            ${post.mediaUrl ? `
                <div class="post-media">
                    ${post.mediaType === 'image' ? 
                        `<img src="${post.mediaUrl}" alt="Post image">` : 
                        post.mediaType === 'video' ?
                        `<video src="${post.mediaUrl}" controls></video>` :
                        `<div class="file-preview">
                            <i class="fas fa-file"></i>
                            <span>${post.fileName}</span>
                        </div>`
                    }
                </div>
            ` : ''}
            <div class="post-actions">
                <button onclick="likePost(${post.id})" class="like-btn ${post.likes.includes(currentUser?.username) ? 'liked' : ''}">
                    <i class="fas fa-heart"></i>
                    <span>${post.likes.length}</span>
                </button>
                <button onclick="showComments(${post.id})" class="comment-btn">
                    <i class="fas fa-comment"></i>
                    <span>${post.comments.length}</span>
                </button>
                ${post.author === currentUser?.username ? `
                    <button onclick="deletePost(${post.id})" class="delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
            <div class="post-comments" id="comments-${post.id}"></div>
        `;
        postsContainer.appendChild(postElement);
    });
}

function likePost(postId) {
    if (!currentUser) {
        showNotification('error', 'Пожалуйста, войдите в систему');
        return;
    }

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const likeIndex = post.likes.indexOf(currentUser.username);
    if (likeIndex === -1) {
        post.likes.push(currentUser.username);
    } else {
        post.likes.splice(likeIndex, 1);
    }

    localStorage.setItem('posts', JSON.stringify(posts));
    displayPosts();
    updateUserStats();
}

function deletePost(postId) {
    if (!currentUser) return;

    const post = posts.find(p => p.id === postId);
    if (post && post.author === currentUser.username) {
        posts = posts.filter(p => p.id !== postId);
        localStorage.setItem('posts', JSON.stringify(posts));
        
        const user = users.find(u => u.username === currentUser.username);
        if (user) {
            user.posts = user.posts.filter(id => id !== postId);
            localStorage.setItem('users', JSON.stringify(users));
        }
        
        displayPosts();
        updateUserStats();
        showNotification('success', 'Пост удален');
    }
}

// Функция для показа уведомлений
function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Функции для страницы профиля
function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-pane');
    const buttons = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`.tab-btn[onclick="showTab('${tabName}')"]`).classList.add('active');
}

function loadProfile() {
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileName').textContent = currentUser.name || 'Не указано';
    document.getElementById('profileEmail').textContent = currentUser.email || 'Не указан';
    document.getElementById('profileJoinDate').textContent = currentUser.joinDate || 'Не указана';
    document.getElementById('profileBio').textContent = currentUser.bio || 'Не указано';
    document.getElementById('profilePostCount').textContent = currentUser.posts?.length || 0;
    document.getElementById('profileLikeCount').textContent = currentUser.likes || 0;
    document.getElementById('profileFollowers').textContent = currentUser.followers || 0;

    loadProfilePosts();
}

function loadProfilePosts() {
    if (!currentUser) return;
    
    const postsContainer = document.getElementById('profilePostsContainer');
    if (!postsContainer) return;
    
    postsContainer.innerHTML = '';

    const userPosts = posts.filter(post => post.author === currentUser.username);
    if (userPosts.length === 0) {
        postsContainer.innerHTML = '<p class="no-posts">У вас пока нет постов</p>';
        return;
    }

    userPosts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = 'post';
        postElement.innerHTML = `
            <div class="post-header">
                <div class="post-date">
                    <i class="far fa-clock"></i>
                    ${new Date(post.date).toLocaleString()}
                </div>
            </div>
            <div class="post-content">${post.content}</div>
            ${post.mediaUrl ? `
                <div class="post-media">
                    ${post.mediaType === 'image' ? 
                        `<img src="${post.mediaUrl}" alt="Post image">` : 
                        post.mediaType === 'video' ?
                        `<video src="${post.mediaUrl}" controls></video>` :
                        `<div class="file-preview">
                            <i class="fas fa-file"></i>
                            <span>${post.fileName}</span>
                        </div>`
                    }
                </div>
            ` : ''}
            <div class="post-actions">
                <button class="like-btn ${post.likes.includes(currentUser.username) ? 'liked' : ''}">
                    <i class="fas fa-heart"></i>
                    <span>${post.likes.length}</span>
                </button>
                <button class="comment-btn">
                    <i class="fas fa-comment"></i>
                    <span>${post.comments.length}</span>
                </button>
                <button onclick="deletePost(${post.id})" class="delete-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        postsContainer.appendChild(postElement);
    });
}

function changePassword() {
    if (!currentUser) return;
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showNotification('error', 'Пожалуйста, заполните все поля');
        return;
    }

    if (currentUser.password !== currentPassword) {
        showNotification('error', 'Неверный текущий пароль');
        return;
    }

    if (newPassword !== confirmPassword) {
        showNotification('error', 'Новые пароли не совпадают');
        return;
    }

    currentUser.password = newPassword;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    const userIndex = users.findIndex(u => u.username === currentUser.username);
    if (userIndex !== -1) {
        users[userIndex].password = newPassword;
        localStorage.setItem('users', JSON.stringify(users));
    }
    
    showNotification('success', 'Пароль успешно изменен');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

// Инициализация страницы профиля
if (window.location.pathname.includes('profile.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        loadFromStorage();
        loadProfile();
    });
} 