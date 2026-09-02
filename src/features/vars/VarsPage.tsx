import { uid } from "@/lib/id";
import type { ProjectVariable } from "@/model/types";
import { readFileAsDataUrl } from "@/persist/storage";
import { useAppStore } from "@/store/appStore";

export function VarsPage() {
  const { current, patchProject } = useAppStore();
  if (!current) return null;
  const vars = current.variables ?? [];

  function setVars(variables: ProjectVariable[]) {
    patchProject((p) => ({ ...p, variables }));
  }

  return (
    <div className="page" style={{ width: "100%", maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>变量</h1>
          <p className="muted">文本中写 {"{力量}"}、{"{project}"}、{"{#}"}、{"{@}"}、{"{amount}"}、{"{blueprint}"}。</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() =>
            setVars([...vars, { id: uid("var"), tag: `变量${vars.length + 1}`, replacement: "", kind: "text" }])
          }
        >
          添加变量
        </button>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>标签</th>
            <th>类型</th>
            <th>替换</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => (
            <tr key={v.id}>
              <td>
                <input
                  value={v.tag}
                  onChange={(e) =>
                    setVars(vars.map((x) => (x.id === v.id ? { ...x, tag: e.target.value } : x)))
                  }
                />
              </td>
              <td>
                <select
                  value={v.kind}
                  onChange={(e) =>
                    setVars(vars.map((x) => (x.id === v.id ? { ...x, kind: e.target.value as "text" | "icon" } : x)))
                  }
                >
                  <option value="text">文本</option>
                  <option value="icon">图标</option>
                </select>
              </td>
              <td>
                {v.kind === "icon" ? (
                  <div className="row">
                    {v.replacement && <img src={current.assets[v.replacement] ?? v.replacement} alt="" style={{ width: 28, height: 28 }} />}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const data = await readFileAsDataUrl(file);
                        const assetId = uid("ico");
                        patchProject((p) => ({
                          ...p,
                          assets: { ...p.assets, [assetId]: data },
                          variables: (p.variables ?? []).map((x) =>
                            x.id === v.id ? { ...x, replacement: assetId } : x,
                          ),
                        }));
                      }}
                    />
                  </div>
                ) : (
                  <input
                    value={v.replacement}
                    onChange={(e) =>
                      setVars(vars.map((x) => (x.id === v.id ? { ...x, replacement: e.target.value } : x)))
                    }
                  />
                )}
              </td>
              <td>
                <button className="btn btn-small btn-danger" onClick={() => setVars(vars.filter((x) => x.id !== v.id))}>
                  删
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
