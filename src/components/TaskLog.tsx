type TaskLogProps = {
  success: number;
  failed: number;
  logs: string[];
  isProcessing: boolean;
  total?: number;
  current?: number;
};

export function TaskLog({ success, failed, logs, isProcessing, total = 0, current = 0 }: TaskLogProps) {
  const completed = success + failed;
  const taskTotal = Math.max(total, completed);
  const progress = taskTotal > 0 ? Math.round((Math.max(current, completed) / taskTotal) * 100) : 0;

  return (
    <section className="panel log-panel">
      <div className="task-row">
        <div className="task-heading">
          <h2>任务</h2>
          <span>{isProcessing ? `${Math.max(current, completed)}/${taskTotal}` : "Idle"}</span>
        </div>
        <div className="task-progress">
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="task-stat">
          <strong>{success}</strong>
          <span>完成</span>
        </div>
        <div className="task-stat">
          <strong>{failed}</strong>
          <span>失败</span>
        </div>
      </div>

      <div className="log-box">
        {logs.length === 0 ? (
          <p>等待任务开始</p>
        ) : (
          logs.map((log, index) => <p key={`${log}-${index}`}>{log}</p>)
        )}
      </div>
    </section>
  );
}
