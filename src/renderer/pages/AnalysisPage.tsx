import { useEffect, useMemo, useState } from 'react';
import { App, Empty, Progress, Skeleton, Statistic, Tag } from 'antd';
import type { TradeReview, WorkspaceSnapshot } from '../../shared/api.types';
import { formatCurrency } from '../lib/trading-format';

export function AnalysisPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [reviews, setReviews] = useState<TradeReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([window.desktop.workspace.snapshot(), window.desktop.reviews.list()])
      .then(([nextSnapshot, nextReviews]) => {
        if (!active) return;
        setSnapshot(nextSnapshot);
        setReviews(nextReviews);
      })
      .catch((reason: unknown) => {
        if (active) void message.error(reason instanceof Error ? reason.message : '分析数据读取失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [message]);

  const stats = useMemo(() => {
    let wins = 0;
    let planned = 0;
    let positiveProcess = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    for (const review of reviews) {
      if (review.pnl > 0) {
        wins += 1;
        totalProfit += review.pnl;
      } else if (review.pnl < 0) {
        totalLoss += Math.abs(review.pnl);
      }
      if (review.planned) planned += 1;
      if (review.executionScore >= 4) positiveProcess += 1;
    }
    return {
      winRate: reviews.length === 0 ? 0 : (wins / reviews.length) * 100,
      plannedRate: reviews.length === 0 ? 0 : (planned / reviews.length) * 100,
      disciplinedRate: reviews.length === 0 ? 0 : (positiveProcess / reviews.length) * 100,
      profitFactor: totalLoss === 0 ? null : totalProfit / totalLoss,
    };
  }, [reviews]);

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">PROCESS OVER OUTCOME</p>
          <h1>复盘分析</h1>
          <p className="page-intro">收益解释结果，纪律指标解释过程；样本量始终和结论一起展示。</p>
        </div>
        <Tag color={reviews.length >= 20 ? 'green' : 'orange'}>
          {reviews.length >= 20 ? '样本可分析' : `小样本 · ${reviews.length} 笔`}
        </Tag>
      </header>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : reviews.length === 0 ? (
        <div className="empty-panel">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成交易复盘后，这里会自动形成过程与结果分析" />
        </div>
      ) : (
        <>
          <section className="analysis-hero">
            <article className={(snapshot?.totalPnl ?? 0) >= 0 ? 'metric-profit' : 'metric-loss'}>
              <Statistic title="累计净盈亏" value={formatCurrency(snapshot?.totalPnl ?? 0)} />
              <p>基于 {reviews.length} 笔已复盘交易</p>
            </article>
            <article>
              <Statistic title="胜率" value={stats.winRate.toFixed(1)} suffix="%" />
              <p>不能单独代表策略质量</p>
            </article>
            <article>
              <Statistic title="Profit Factor" value={stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)} />
              <p>{stats.profitFactor === null ? '当前没有已实现亏损' : '总盈利 / 总亏损'}</p>
            </article>
            <article>
              <Statistic
                title="平均纪律评分"
                value={snapshot?.averageExecutionScore === null ? '—' : (snapshot?.averageExecutionScore ?? 0).toFixed(1)}
                suffix="/ 5"
              />
              <p>与交易盈亏分开统计</p>
            </article>
          </section>

          <section className="process-panel">
            <div className="section-heading">
              <div>
                <span className="section-label">过程质量</span>
                <h2>计划与纪律</h2>
              </div>
              <span>目标不是多交易，而是少犯重复错误</span>
            </div>
            <div className="process-grid">
              <article>
                <Progress type="dashboard" percent={Math.round(stats.plannedRate)} size={140} />
                <strong>计划内交易占比</strong>
                <p>无计划交易会单独进入改进清单。</p>
              </article>
              <article>
                <Progress type="dashboard" percent={Math.round(stats.disciplinedRate)} size={140} strokeColor="#16845b" />
                <strong>高纪律交易占比</strong>
                <p>纪律评分达到 4 分及以上。</p>
              </article>
              <article className="sample-guidance">
                <span>当前样本</span>
                <strong>{reviews.length}</strong>
                <p>
                  {reviews.length < 20 ? '不足 20 笔时只展示事实，不判断策略是否有效。' : '可以开始按策略和错误标签进一步拆分。'}
                </p>
              </article>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
