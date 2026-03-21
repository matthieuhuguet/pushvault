#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Check for --mcp flag to run as MCP server (stdio JSON-RPC)
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp") {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(pushvault_lib::mcp_server::run_mcp_server());
        return;
    }

    pushvault_lib::run();
}
