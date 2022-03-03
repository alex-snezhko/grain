//let _ = Lspserver.run();

open Printf;
open Cmdliner;

let lsp_wrapper = () => {
  let _ = Lspserver.run();

  `Ok();
};

let lsp = opts =>
  try(lsp_wrapper()) {
  | exn =>
    Format.eprintf("@[%s@]@.", Printexc.to_string(exn));
    exit(2);
  };

[@deriving cmdliner]
type params = {
  [@name "debuglsp"] [@docv "DEBUGLOG"]
  debug_log: option(string),
};

let cmd = {
  open Term;

  let doc = "Grain LSP server";
  let version =
    switch (Build_info.V1.version()) {
    | None => "unknown"
    | Some(v) => Build_info.V1.Version.to_string(v)
    };
  (
    Term.(
      ret(Grain_utils.Config.with_cli_options(lsp) $ params_cmdliner_term())
    ),
    Term.info(Sys.argv[0], ~version, ~doc),
  );
};

let () =
  switch (Term.eval(cmd)) {
  | `Error(_) =>
    print_endline("error");
    exit(1);
  | _ => print_endline("OK")
  };