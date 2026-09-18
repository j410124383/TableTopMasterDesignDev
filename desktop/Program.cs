using System.Diagnostics;
using System.Net.Http;
using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TMD;

static class Program
{
    const int Port = 1420;
    const string Url = "http://127.0.0.1:1420/";

    static Process? _server;
    static bool _startedServer;
    static bool _preview;
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
        _preview = UsePreview(root, args);
        Application.ApplicationExit += (_, _) => Shutdown();
        Application.Run(new MainForm(root));
        Shutdown();
    }

    static bool WantDev(string[] args)
    {
        foreach (var a in args)
        {
            if (a.Equals("--dev", StringComparison.OrdinalIgnoreCase)) return true;
        }
        var env = Environment.GetEnvironmentVariable("TMD_DEV");
        return env == "1" || string.Equals(env, "true", StringComparison.OrdinalIgnoreCase);
    }

    static bool UsePreview(string root, string[] args)
    {
        if (WantDev(args)) return false;
        return File.Exists(Path.Combine(root, "dist", "index.html"));
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

    internal static string AppVersion(string root)
    {
        try
        {
            var json = File.ReadAllText(Path.Combine(root, "package.json"));
            var m = Regex.Match(json, "\"version\"\\s*:\\s*\"([^\"]+)\"");
            if (m.Success) return m.Groups[1].Value;
        }
        catch
        {
            /* fall through */
        }
        var info = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrEmpty(info)) return info.Split('+')[0];
        var ver = typeof(Program).Assembly.GetName().Version;
        return ver is null ? "" : $"{ver.Major}.{ver.Minor}.{ver.Build}";
    }

    internal static void BootSidecar(string root)
    {
        if (!_preview) EnsureNodeModules(root);
        StartSidecar(root);
        if (!WaitReady())
            throw new InvalidOperationException("本地服务没有在 1420 起来。可再双击一次，或运行「打开卡牌工坊.bat /console」看日志。");
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
        if (!File.Exists(vite))
        {
            throw new InvalidOperationException(_preview
                ? "发版包不完整（缺少 Vite）。请重新下载完整离线包。"
                : "找不到 Vite。请先在本目录完成 npm install。");
        }
        var arguments = _preview
            ? $"\"{vite}\" preview --host 0.0.0.0 --port {Port} --strictPort"
            : $"\"{vite}\" --host 0.0.0.0 --port {Port}";
        var psi = new ProcessStartInfo
        {
            FileName = NodeExe(root),
            Arguments = arguments,
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
    readonly WebView2 _web = new() { Dock = DockStyle.Fill, Visible = false };
    readonly Label _splash;
    readonly string _root;
    readonly Task _sidecar;

    public MainForm(string root)
    {
        _root = root;
        var verText = Program.AppVersion(root);
        Text = string.IsNullOrEmpty(verText) ? "TMD" : $"TMD {verText}";
        MinimumSize = new Size(960, 600);
        StartPosition = FormStartPosition.Manual;
        FillScreen();
        BackColor = Color.FromArgb(22, 22, 24);
        _splash = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.FromArgb(230, 230, 232),
            BackColor = Color.FromArgb(22, 22, 24),
            Font = new Font("Segoe UI", 16f, FontStyle.Regular),
            Text = string.IsNullOrEmpty(verText)
                ? "TMD\n正在启动…"
                : $"TMD  v{verText}\n正在启动…",
        };
        Controls.Add(_web);
        Controls.Add(_splash);
        _splash.BringToFront();
        _sidecar = Task.Run(() => Program.BootSidecar(_root));
        Load += (_, _) => FillScreen();
        Shown += async (_, _) =>
        {
            FillScreen();
            await FinishBoot();
        };
        FormClosed += (_, _) => Program.Shutdown();
    }

    void FillScreen()
    {
        var screen = IsHandleCreated ? Screen.FromHandle(Handle) : Screen.FromPoint(Cursor.Position);
        var wa = (screen ?? Screen.PrimaryScreen)?.WorkingArea ?? new Rectangle(0, 0, 1280, 840);
        WindowState = FormWindowState.Normal;
        Bounds = wa;
        WindowState = FormWindowState.Maximized;
    }

    async Task FinishBoot()
    {
        try
        {
            await _sidecar;
            await BootWeb();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "TMD", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
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
            _web.CoreWebView2.NavigationCompleted += (_, _) =>
            {
                _web.Visible = true;
                _splash.Visible = false;
            };
            _web.CoreWebView2.Navigate("http://127.0.0.1:1420/");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show("需要 Microsoft Edge WebView2 运行时。请安装 Edge 或 WebView2 Runtime。", "TMD", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }
}
