import {
  BarChartOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FundOutlined,
  GithubOutlined,
  HeartOutlined,
  KeyOutlined,
  LockOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { useEffect, useState } from 'react';
import {
  ABOUT_FEATURE_ITEMS,
  ABOUT_MISSION_PARAGRAPHS,
  ABOUT_PRINCIPLES,
  ABOUT_SECURITY_POINTS,
  APP_REPOSITORY_URL,
  COMMUNITY_CHANNEL,
  DONATION_CHANNELS,
} from '../../shared/about/constants';
import { APP_NAME, APP_SLOGAN } from '../../shared/brand';

const securityIcons = [
  DatabaseOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  GithubOutlined,
] as const;

const featureIcons = [DashboardOutlined, ProjectOutlined, FundOutlined, BarChartOutlined] as const;

function openExternal(url: string): void {
  void window.desktop.system.openExternal(url);
}

export function AboutPage(): React.JSX.Element {
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    void window.desktop.updater
      .getState()
      .then((state) => setAppVersion(state.currentVersion))
      .catch(() => setAppVersion(''));
  }, []);

  return (
    <main className="workspace-page about-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">LOCAL FIRST · OPEN SOURCE</p>
          <h1>关于我们</h1>
          <p className="page-intro">
            {APP_NAME} — {APP_SLOGAN.full}
          </p>
        </div>
        <div className="about-header-meta">
          <Tag icon={<CloudServerOutlined />} color="blue">
            本地优先
          </Tag>
          {appVersion ? <Tag color="processing">v{appVersion}</Tag> : null}
        </div>
      </header>

      <section className="about-principles" aria-label="产品原则">
        {ABOUT_PRINCIPLES.map((item) => (
          <article key={item.title}>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">OVERVIEW</span>
            <h2>我们在做什么</h2>
          </div>
        </div>
        <p className="page-intro">
          面向个人投资者的<strong>本地优先</strong>桌面工作台。它不替你做决定，而是把计划、提醒、持仓、定投与复盘连成一条线，帮助你在自己的规则里持续迭代。
        </p>
        <div className="about-feature-grid">
          {ABOUT_FEATURE_ITEMS.map((item, index) => {
            const Icon = featureIcons[index] ?? DashboardOutlined;
            return (
              <article key={item.title}>
                <Icon aria-hidden="true" />
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">MISSION</span>
            <h2>为什么做这个项目</h2>
          </div>
        </div>
        <div className="about-mission-copy">
          {ABOUT_MISSION_PARAGRAPHS.map((paragraph, index) => (
            <p key={paragraph.slice(0, 12)} className={index === 0 ? 'about-mission-lead' : undefined}>
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">SECURITY</span>
            <h2>你的数据，留在你的设备</h2>
          </div>
          <Tag icon={<SafetyCertificateOutlined />} color="processing">
            安全设计
          </Tag>
        </div>
        <p className="page-intro">
          交易记录是高度敏感的个人数据。我们在架构上默认：网络不可信、云端不可用——你应随时能完整带走自己的资料。
        </p>
        <div className="about-security-grid">
          {ABOUT_SECURITY_POINTS.map((item, index) => {
            const Icon = securityIcons[index] ?? SafetyCertificateOutlined;
            return (
              <article key={item.title} className="about-security-card">
                <div className="about-security-card-head">
                  <Icon aria-hidden="true" />
                  <h3>{item.title}</h3>
                </div>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">OPEN SOURCE</span>
            <h2>源代码仓库</h2>
          </div>
          <Tag icon={<GithubOutlined />}>MIT</Tag>
        </div>
        <p className="page-intro">
          项目以 MIT 协议开源。欢迎提交 Issue、PR，或 Fork 后在本地自行构建；发现问题可直接在仓库讨论，也便于社区共同审查数据处理逻辑。
        </p>
        <div className="about-repo-row">
          <code className="about-repo-url">{APP_REPOSITORY_URL}</code>
          <Button type="primary" icon={<GithubOutlined />} onClick={() => openExternal(APP_REPOSITORY_URL)}>
            在浏览器中打开
          </Button>
        </div>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">COMMUNITY</span>
            <h2>交流与支持</h2>
          </div>
          <Tag icon={<TeamOutlined />} color="cyan">
            用户群
          </Tag>
        </div>
        <p className="page-intro">
          交易日记由独立开发者维护。加入交流群获取用法帮助与版本动态；若产品帮你建立了更好的交易纪律，也欢迎自愿赞赏，支持后续开发与文档维护。
        </p>
        <div className="about-support-grid">
          <article className="about-support-card">
            <div className="about-support-card-head">
              <TeamOutlined aria-hidden="true" />
              <div>
                <strong>{COMMUNITY_CHANNEL.label}</strong>
                <span>{COMMUNITY_CHANNEL.subtitle}</span>
              </div>
            </div>
            <figure className="about-qr-frame">
              <img src={COMMUNITY_CHANNEL.imageSrc} alt={`${COMMUNITY_CHANNEL.label}二维码`} loading="lazy" />
            </figure>
            <p>{COMMUNITY_CHANNEL.hint}</p>
            <p className="about-support-footnote">{COMMUNITY_CHANNEL.footnote}</p>
          </article>

          {DONATION_CHANNELS.map((channel) => (
            <article key={channel.id} className="about-support-card about-support-card--donate">
              <div className="about-support-card-head">
                <HeartOutlined aria-hidden="true" />
                <div>
                  <strong>{channel.label}</strong>
                  <Tag color="magenta">自愿支持</Tag>
                </div>
              </div>
              <figure className="about-qr-frame about-qr-frame--light">
                <img src={channel.imageSrc} alt={`${channel.label}二维码`} loading="lazy" />
              </figure>
              <p>{channel.hint}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
