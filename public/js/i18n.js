/**
 * Internationalization (i18n) module for 天下太平 website
 * Handles multiple language support
 */

// Available languages with their locale codes
const AVAILABLE_LANGUAGES = {
  'zh': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean'
};

// Default language
const DEFAULT_LANGUAGE = 'zh';

// Translations dictionary
const translations = {
  // Chinese translations (default - Simplified)
  zh: {
    'title': '天下太平',
    'login': '登录',
    'signup': '注册',
    'logout': '退出登录',
    'welcome': '欢迎来到天下太平',
    'username': '用户名',
    'password': '密码',
    'confirm_password': '确认密码',
    'rank': '等级',
    'user_profile': '个人中心',
    'back_to_home': '返回首页',
    'login_success': '登录成功！正在跳转...',
    'login_error': '用户名或密码错误',
    'signup_success': '注册成功！正在跳转到首页...',
    'passwords_mismatch': '两次输入的密码不匹配',
    'username_exists': '用户名已存在',
    'system_error': '发生错误，请稍后再试',
    'no_account': '还没有账号?',
    'have_account': '已有账号?',
    'logout_success': '退出登录成功！正在跳转...',
    'logout_error': '退出登录失败',
    'profile_welcome_text': '您已成功登录系统，可以访问所有功能。',
    'create_room': '创建房间',
    'join_room': '加入房间',
    'room_id': '房间号',
    'login_required': '请先登录后再创建房间',
    'game_room': '游戏房间',
    'player_count': '玩家数量',
    'player_list': '玩家列表',
    'room_owner': '房主',
    'start_game': '开始游戏',
    'leave_room': '离开房间',
    'loading': '加载中...',
    'admin_panel': '管理面板',
    'one_v_one': '1v1',
    'admin_panel': '管理面板',
    'copy_room_link': '复制房间链接',
    'room_link_copied': '房间链接已复制到剪贴板',
    'copy_failed': '复制失败，请手动复制链接',
    'room_full': '房间已满',
    'room_not_found': '房间不存在',
    'username_taken': '该用户名已被使用',
    'need_two_players': '需要两名玩家才能开始游戏',
    'only_host_can_start': '只有房主可以开始游戏',
    'disconnected': '与服务器断开连接',
    'host_left': '房主已离开房间',
    'player_left': '玩家已离开房间',
    'you_are_host': '你现在是房主',
    'last_room_message': '您有一个进行中的游戏房间',
    'rejoin_room': '重新加入房间',
    'rps_draw': '平局',
    'rps_you_win': '你赢了！',
    'rps_you_lose': '你输了！',
    'you_win': '你赢了！',
    'you_lose': '你输了！',
    'draw': '平局',
    'game_over': '游戏结束',
    'return_main': '返回主界面',
    'result_message': '结果'
  },
  
  // Chinese translations (Traditional)
  'zh-TW': {
    'title': '天下太平',
    'login': '登入',
    'signup': '註冊',
    'logout': '登出',
    'welcome': '歡迎來到天下太平',
    'username': '使用者名稱',
    'password': '密碼',
    'confirm_password': '確認密碼',
    'rank': '等級',
    'user_profile': '個人中心',
    'back_to_home': '返回首頁',
    'login_success': '登入成功！正在跳轉...',
    'login_error': '使用者名稱或密碼錯誤',
    'signup_success': '註冊成功！正在跳轉到首頁...',
    'passwords_mismatch': '兩次輸入的密碼不匹配',
    'username_exists': '使用者名稱已存在',
    'system_error': '發生錯誤，請稍後再試',
    'no_account': '還沒有帳號?',
    'have_account': '已有帳號?',
    'logout_success': '登出成功！正在跳轉...',
    'logout_error': '登出失敗',
    'profile_welcome_text': '您已成功登入系統，可以訪問所有功能。',
    'create_room': '創建房間',
    'join_room': '加入房間',
    'room_id': '房間號',
    'login_required': '請先登入後再創建房間',
    'game_room': '遊戲房間',
    'player_count': '玩家數量',
    'player_list': '玩家列表',
    'room_owner': '房主',
    'start_game': '開始遊戲',
    'leave_room': '離開房間',
    'loading': '載入中...',
    'admin_panel': '管理面板',
    'copy_room_link': '複製房間連結',
    'room_link_copied': '房間連結已複製到剪貼簿',
    'copy_failed': '複製失敗，請手動複製連結',
    'room_full': '房間已滿',
    'room_not_found': '房間不存在',
    'username_taken': '該使用者名稱已被使用',
    'need_two_players': '需要兩名玩家才能開始遊戲',
    'only_host_can_start': '只有房主可以開始遊戲',
    'disconnected': '與伺服器斷開連接',
    'host_left': '房主已離開房間',
    'player_left': '玩家已離開房間',
    'you_are_host': '你現在是房主',
    'last_room_message': '您有一個進行中的游戲房間',
    'rejoin_room': '重新加入房間',
    'result_message': '結果'
  },
  
  // English translations
  en: {
    'title': '天下太平',
    'login': 'Login',
    'signup': 'Sign Up',
    'logout': 'Logout',
    'welcome': 'Welcome to Peace Under Heaven',
    'username': 'Username',
    'password': 'Password',
    'confirm_password': 'Confirm Password',
    'rank': 'Rank',
    'user_profile': 'User Profile',
    'back_to_home': 'Back to Home',
    'login_success': 'Login successful! Redirecting...',
    'login_error': 'Incorrect username or password',
    'signup_success': 'Registration successful! Redirecting to home page...',
    'passwords_mismatch': 'Passwords do not match',
    'username_exists': 'Username already exists',
    'system_error': 'An error occurred, please try again later',
    'no_account': 'Don\'t have an account?',
    'have_account': 'Already have an account?',
    'logout_success': 'Logout successful! Redirecting...',
    'logout_error': 'Logout failed',
    'profile_welcome_text': 'You have successfully logged in and can access all features.',
    'create_room': 'Create Room',
    'join_room': 'Join Room',
    'room_id': 'Room ID',
    'login_required': 'Please log in first to create a room',
    'game_room': 'Game Room',
    'player_count': 'Players',
    'player_list': 'Player List',
    'room_owner': 'Host',
    'start_game': 'Start Game',
    'leave_room': 'Leave Room',
    'loading': 'Loading...',
    'admin_panel': 'Admin Panel',
    'copy_room_link': 'Copy Room Link',
    'room_link_copied': 'Room link copied to clipboard',
    'copy_failed': 'Copy failed, please copy the link manually',
    'room_full': 'Room is full',
    'room_not_found': 'Room not found',
    'username_taken': 'Username is already taken',
    'need_two_players': 'Need exactly 2 players to start',
    'only_host_can_start': 'Only the host can start the game',
    'disconnected': 'Disconnected from server',
    'host_left': 'Host has left the room',
    'player_left': 'Player has left the room',
    'you_are_host': 'You are now the host',
    'last_room_message': 'You have an ongoing game room',
    'rejoin_room': 'Rejoin Room',
    'rps_draw': 'Draw',
    'rps_you_win': 'You win!',
    'rps_you_lose': 'You lose!',
    'you_win': 'You Win!',
    'you_lose': 'You Lose!',
    'draw': 'Draw',
    'game_over': 'Game Over',
    'return_main': 'Return to Main Screen',
    'result_message': 'Result'
  },
  
  // Japanese translations
  ja: {
    'title': '天下太平',
    'login': 'ログイン',
    'signup': '登録',
    'logout': 'ログアウト',
    'welcome': '天下泰平へようこそ',
    'username': 'ユーザー名',
    'password': 'パスワード',
    'confirm_password': 'パスワードを確認',
    'rank': 'ランク',
    'user_profile': 'ユーザープロフィール',
    'back_to_home': 'ホームに戻る',
    'login_success': 'ログイン成功！リダイレクト中...',
    'login_error': 'ユーザー名またはパスワードが正しくありません',
    'signup_success': '登録成功！ホームページにリダイレクト中...',
    'passwords_mismatch': 'パスワードが一致しません',
    'username_exists': 'ユーザー名はすでに存在します',
    'system_error': 'エラーが発生しました。後でもう一度お試しください',
    'no_account': 'アカウントをお持ちでないですか？',
    'have_account': 'すでにアカウントをお持ちですか？',
    'logout_success': 'ログアウト成功！リダイレクト中...',
    'logout_error': 'ログアウトに失敗しました',
    'profile_welcome_text': 'ログインに成功しました。すべての機能にアクセスできます。',
    'create_room': 'ルームを作成',
    'join_room': 'ルームに参加',
    'room_id': 'ルームID',
    'login_required': 'ルームを作成するには、先にログインしてください',
    'game_room': 'ゲームルーム',
    'player_count': 'プレイヤー数',
    'player_list': 'プレイヤーリスト',
    'room_owner': 'ホスト',
    'start_game': 'ゲーム開始',
    'leave_room': 'ルームを退出',
    'loading': '読み込み中...',
    'admin_panel': '管理パネル',
    'copy_room_link': 'ルームリンクをコピー',
    'room_link_copied': 'ルームリンクをクリップボードにコピーしました',
    'copy_failed': 'コピーに失敗しました。リンクを手動でコピーしてください',
    'room_full': 'ルームが満員です',
    'room_not_found': 'ルームが見つかりません',
    'username_taken': 'このユーザー名は既に使用されています',
    'need_two_players': 'ゲームを開始するには2人のプレイヤーが必要です',
    'only_host_can_start': 'ホストのみがゲームを開始できます',
    'disconnected': 'サーバーから切断されました',
    'host_left': 'ホストがルームを退出しました',
    'player_left': 'プレイヤーがルームを退出しました',
    'you_are_host': 'あなたが新しいホストになりました',
    'last_room_message': '進行中のゲームルームがあります',
    'rejoin_room': '部屋に再参加',
    'result_message': '結果'
  },
  
  // Korean translations
  ko: {
    'title': '천하태평',
    'login': '로그인',
    'signup': '회원가입',
    'logout': '로그아웃',
    'welcome': '천하태평에 오신 것을 환영합니다',
    'username': '사용자 이름',
    'password': '비밀번호',
    'confirm_password': '비밀번호 확인',
    'rank': '랭크',
    'user_profile': '사용자 프로필',
    'back_to_home': '홈으로 돌아가기',
    'login_success': '로그인 성공! 리디렉션 중...',
    'login_error': '사용자 이름 또는 비밀번호가 잘못되었습니다',
    'signup_success': '등록 성공! 홈페이지로 리디렉션 중...',
    'passwords_mismatch': '비밀번호가 일치하지 않습니다',
    'username_exists': '사용자 이름이 이미 존재합니다',
    'system_error': '오류가 발생했습니다. 나중에 다시 시도해주세요',
    'no_account': '계정이 없으신가요?',
    'have_account': '이미 계정이 있으신가요?',
    'logout_success': '로그아웃 성공! 리디렉션 중...',
    'logout_error': '로그아웃 실패',
    'profile_welcome_text': '성공적으로 로그인했습니다. 모든 기능에 접근할 수 있습니다.',
    'create_room': '방 만들기',
    'join_room': '방 참가하기',
    'room_id': '방 ID',
    'login_required': '방을 만들려면 먼저 로그인해주세요',
    'game_room': '게임방',
    'player_count': '플레이어 수',
    'player_list': '플레이어 목록',
    'room_owner': '방장',
    'start_game': '게임 시작',
    'leave_room': '방 나가기',
    'loading': '로딩 중...',
    'admin_panel': '관리자 패널',
    'copy_room_link': '방 링크 복사',
    'room_link_copied': '방 링크가 클립보드에 복사되었습니다',
    'copy_failed': '복사 실패, 링크를 수동으로 복사해주세요',
    'room_full': '방이 가득 찼습니다',
    'room_not_found': '방을 찾을 수 없습니다',
    'username_taken': '이미 사용 중인 사용자 이름입니다',
    'need_two_players': '게임을 시작하려면 2명의 플레이어가 필요합니다',
    'only_host_can_start': '방장만 게임을 시작할 수 있습니다',
    'disconnected': '서버와 연결이 끊어졌습니다',
    'host_left': '방장이 방을 나갔습니다',
    'player_left': '플레이어가 방을 나갔습니다',
    'you_are_host': '당신이 새로운 방장이 되었습니다',
    'last_room_message': '진행 중인 게임 방이 있습니다',
    'rejoin_room': '방 다시 참가하기',
    'result_message': '결과'
  }
};

/**
 * I18n class for handling translations
 */
class I18n {
  constructor() {
    // Get browser language if it's supported
    this.currentLanguage = this.getBrowserLanguage() || DEFAULT_LANGUAGE;
  }
  
  /**
   * Get browser language if it's supported
   * @returns {string} Supported language code or null
   */
  getBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    
    // Check for full locale match (e.g., zh-TW)
    if (translations[browserLang]) {
      return browserLang;
    }
    
    // Check for language match only (e.g., zh from zh-HK)
    const langCode = browserLang.split('-')[0];
    return translations[langCode] ? langCode : null;
  }
  
  /**
   * Get list of available languages
   * @returns {Object} Available languages
   */
  getAvailableLanguages() {
    return AVAILABLE_LANGUAGES;
  }
  
  /**
   * Get current language
   * @returns {string} Current language code
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }
  
  /**
   * Set current language
   * @param {string} langCode - Language code to set
   * @returns {boolean} Success status
   */
  setLanguage(langCode) {
    if (translations[langCode]) {
      this.currentLanguage = langCode;
      
      // Save to localStorage
      localStorage.setItem('language', langCode);
      
      // Trigger language change event
      const event = new CustomEvent('languageChanged', { detail: { language: langCode } });
      document.dispatchEvent(event);
      
      return true;
    }
    return false;
  }
  
  /**
   * Get translation for a key
   * @param {string} key - Translation key
   * @returns {string} Translated text or key if not found
   */
  translate(key) {
    const lang = this.currentLanguage;
    
    if (translations[lang] && translations[lang][key]) {
      return translations[lang][key];
    }
    
    // Fallback to default language
    if (translations[DEFAULT_LANGUAGE] && translations[DEFAULT_LANGUAGE][key]) {
      return translations[DEFAULT_LANGUAGE][key];
    }
    
    // Return key as fallback
    return key;
  }
  
  /**
   * Initialize i18n system
   */
  init() {
    // Check for stored language preference
    const storedLang = localStorage.getItem('language');
    if (storedLang && translations[storedLang]) {
      this.currentLanguage = storedLang;
    }
    
    // Apply translations to the page
    this.applyTranslations();
    
    // Set up language change listener
    document.addEventListener('languageChanged', () => {
      this.applyTranslations();
    });
  }
  
  /**
   * Apply translations to elements with data-i18n attribute
   */
  applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      element.textContent = this.translate(key);
    });
    
    // Also update placeholder attributes
    const inputElements = document.querySelectorAll('[data-i18n-placeholder]');
    inputElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      element.setAttribute('placeholder', this.translate(key));
    });
  }
}

// Create and export singleton instance
const i18n = new I18n();
export default i18n;