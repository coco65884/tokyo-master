import { Link } from 'react-router-dom';
import '@/styles/SettingsPage.css';

export default function PrivacyPolicyPage() {
  return (
    <div className="settings-page">
      <header className="settings-header">
        <Link to="/settings" className="back-link">
          ← 設定
        </Link>
        <h1>プライバシーポリシー</h1>
      </header>

      <div className="settings-content">
        <section className="settings-section">
          <h2 className="settings-section__title">はじめに</h2>
          <p className="privacy-text">
            Tokyo Master（以下「本アプリ」）は、ユーザーのプライバシーを尊重し、
            個人情報の保護に努めます。本ポリシーでは、本アプリにおけるデータの
            取り扱いについて説明します。
          </p>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">収集するデータ</h2>
          <p className="privacy-text">
            本アプリは、ユーザーのアカウント登録や個人情報の入力を必要としません。
            クイズの回答履歴やアチーブメントの進捗データは、すべてユーザーの端末内
            にのみ保存され、外部サーバーには送信されません。
          </p>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">第三者サービス</h2>
          <p className="privacy-text">本アプリは以下の第三者サービスを利用しています。</p>
          <ul className="privacy-list">
            <li>
              <strong>Google AdMob</strong>:
              広告配信のために使用されます。AdMobは広告の表示とパフォーマンス測定のため、
              デバイス識別子やIPアドレスなどの情報を収集する場合があります。
              詳細はGoogleのプライバシーポリシーをご確認ください。
            </li>
            <li>
              <strong>OpenStreetMap</strong>:
              地図タイルの取得時に、ユーザーのIPアドレスがタイルサーバーに送信されます。
            </li>
          </ul>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">広告とトラッキング</h2>
          <p className="privacy-text">
            本アプリはiOSのApp Tracking Transparency (ATT) フレームワークに準拠しています。
            広告のパーソナライズにはユーザーの許可が必要であり、
            許可されない場合は非パーソナライズ広告が表示されます。
          </p>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">データの削除</h2>
          <p className="privacy-text">
            本アプリの設定画面から、クイズ履歴やアチーブメントデータを
            いつでも削除することができます。アプリをアンインストールすると、
            端末に保存されたすべてのデータが削除されます。
          </p>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">お問い合わせ</h2>
          <p className="privacy-text">
            プライバシーに関するお問い合わせは、アプリの開発者までご連絡ください。
          </p>
        </section>

        <section className="settings-section">
          <p className="privacy-text privacy-text--meta">最終更新日: 2026年3月28日</p>
        </section>
      </div>
    </div>
  );
}
