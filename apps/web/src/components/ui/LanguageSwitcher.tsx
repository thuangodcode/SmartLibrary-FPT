import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import './LanguageSwitcher.css';

export const LanguageSwitcher: React.FC = () => {
  const { t, i18n: currentI18n } = useTranslation();
  const isEnglish = currentI18n.resolvedLanguage === 'en';

  return (
    <button
      type="button"
      className="language-switcher"
      aria-pressed={isEnglish}
      aria-label={`${t('language.switch')}: ${isEnglish ? t('language.english') : t('language.vietnamese')}`}
      title={`${t('language.switch')}: ${isEnglish ? t('language.english') : t('language.vietnamese')}`}
      onClick={() => void i18n.changeLanguage(isEnglish ? 'vi' : 'en')}
    >
      <span className="language-switcher-flag" aria-hidden="true">{isEnglish ? '🇬🇧' : '🇻🇳'}</span>
      <span className="language-switcher-code">{isEnglish ? 'EN' : 'VN'}</span>
    </button>
  );
};
