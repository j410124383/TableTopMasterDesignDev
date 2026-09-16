using System.Diagnostics;
using System.Net.Http;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TMD;

static class Program
{
    const int Port = 1420;
    const string Url = "http://127.0.0.1:1420/";

    static Process? _server;
    static bool _startedServer;
    static int _dead;

    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        var args = Environment.GetCommandLineArgs();
        if (args.Length >= 2 && args[1] == "--pick-folder")
        {
            PickFolderAndExit(args);
            return;
        }
        var root = Path.GetDirectoryName(Environment.ProcessPath);
        if (string.IsNullOrEmpty(root) || !File.Exists(Path.Combine(root, "package.json")))
        {
            MessageBox.Show("请把 TMD.exe 放在工坊解压目录里（和 package.json 在一起）。", "TMD", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        Directory.SetCurrentDirectory(root);
        try
        {
            EnsureNodeModules(root);
            StartSidecar(root);
            if (!WaitReady())
            {
                MessageBox.Show("本地服务没有在 1420 起来。可再双击一次，或运行「打开卡牌工坊.bat /console」看日志。", "TMD", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Shutdown();
                return;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "TMD", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Shutdown();
            return;
        }

        Application.ApplicationExit += (_, _) => Shutdown();
        Application.Run(new MainForm(root));
        Shutdown();
    }

    static void PickFolderAndExit(string[] args)
    {
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? Environment.CurrentDirectory;
        var start = args.Length > 2 && Directory.Exists(args[2]) ? args[2] : exeDir;
        var outFile = args.Length > 3 ? args[3] : "";
        using var dlg = new FolderBrowserDialog
        {
            Description = "选择文件夹",
            UseDescriptionForTitle = true,
            AutoUpgradeEnabled = true,
            InitialDirectory = start,
            SelectedPath = start,
            ShowNewFolderButton = true,
        };
        var r = dlg.ShowDialog();
        if (r != DialogResult.OK)
            Environment.Exit(2);
        if (!string.IsNullOrEmpty(outFile))
            File.WriteAllText(outFile, dlg.SelectedPath);
        Environment.Exit(0);
    }

    static void EnsureNodeModules(string root)
    {
        if (Directory.Exists(Path.Combine(root, "node_modules", "vite"))) return;
        var npm = Path.Combine(root, "vendor", "node", "npm.cmd");
        if (!File.Exists(npm)) npm = "npm.cmd";
        var p = Process.Start(new ProcessStartInfo
        {
            FileName = npm,
            Arguments = "install --registry=https://registry.npmmirror.com",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
        });
        p?.WaitForExit();
        if (p is { ExitCode: not 0 })
            throw new InvalidOperationException("依赖没装完。请双击「打开卡牌工坊.bat」先完成第一次安装。");
    }

    static string NodeExe(string root)
    {
        var bundled = Path.Combine(root, "vendor", "node", "node.exe");
        return File.Exists(bundled) ? bundled : "node";
    }

    static void StartSidecar(string root)
    {
        if (ReadyOnce()) return;
        var vite = Path.Combine(root, "node_modules", "vite", "bin", "vite.js");
        if (!File.Exists(vite)) throw new InvalidOperationException("找不到 Vite。请先在本目录完成 npm install。");
        var psi = new ProcessStartInfo
        {
            FileName = NodeExe(root),
            Arguments = $"\"{vite}\" --host 0.0.0.0 --port {Port}",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.Environment["TMD_NO_BROWSER"] = "1";
        _server = Process.Start(psi);
        _startedServer = _server != null;
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "netsh",
                Arguments = "advfirewall firewall add rule name=\"TMD LAN 1420\" dir=in action=allow protocol=TCP localport=1420",
                UseShellExecute = false,
                CreateNoWindow = true,
            });
        }
        catch
        {
            /* 无管理员时忽略 */
        }
    }

    static bool ReadyOnce()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromMilliseconds(400) };
            using var res = http.GetAsync(Url).GetAwaiter().GetResult();
            return (int)res.StatusCode > 0;
        }
        catch
        {
            return false;
        }
    }

    static bool WaitReady()
    {
        var until = DateTime.UtcNow.AddSeconds(90);
        while (DateTime.UtcNow < until)
        {
            if (ReadyOnce()) return true;
            Thread.Sleep(250);
        }
        return false;
    }

    internal static void Shutdown()
    {
        if (Interlocked.Exchange(ref _dead, 1) != 0) return;
        try
        {
            if (_startedServer && _server is { HasExited: false })
            {
                KillTree(_server.Id);
            }
            else
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "powershell",
                    Arguments = $"-NoProfile -Command \"Get-NetTCPConnection -LocalPort {Port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                })?.WaitForExit(5000);
            }
        }
        catch
        {
            /* ignore */
        }
    }

    static void KillTree(int pid)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "taskkill",
                Arguments = $"/PID {pid} /T /F",
                UseShellExecute = false,
                CreateNoWindow = true,
            })?.WaitForExit(5000);
        }
        catch
        {
            /* ignore */
        }
    }
}

sealed class MainForm : Form
{
    readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    readonly string _root;

    public MainForm(string root)
    {
        _root = root;
        Text = "TMD";
        Width = 1280;
        Height = 840;
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(_web);
        Shown += async (_, _) => await BootWeb();
        FormClosed += (_, _) => Program.Shutdown();
    }

    async Task BootWeb()
    {
        try
        {
            var data = Path.Combine(_root, ".tmd-webview");
            Directory.CreateDirectory(data);
            var env = await CoreWebView2Environment.CreateAsync(null, data);
            await _web.EnsureCoreWebView2Async(env);
            _web.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
            _web.CoreWebView2.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                _web.CoreWebView2.Navigate(e.Uri);
            };
            _web.CoreWebView2.Navigate(UrlConst());
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show("需要 Microsoft Edge WebView2 运行时。请安装 Edge 或 WebView2 Runtime。", "TMD", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "TMD", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    static string UrlConst() => "http://127.0.0.1:1420/";
}
