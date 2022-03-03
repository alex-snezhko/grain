let jsonrpc = "2.0";

type protocol_msg =
  | Message(int, string, Yojson.Safe.t)
  | Error(string)
  | Notification(string, Yojson.Safe.t);

[@deriving yojson]
type completion_values = {
  resolveProvider: bool,
  triggerCharacters: list(string),
};

[@deriving yojson]
type lsp_error = {
  file: string,
  line: int,
  startchar: int,
  endline: int,
  endchar: int,
  lsp_message: string,
};

[@deriving yojson]
type lsp_warning = {
  file: string,
  line: int,
  startchar: int,
  endline: int,
  endchar: int,
  number: int,
  lsp_message: string,
};

[@deriving yojson]
type code_values = {resolveProvider: bool};

[@deriving yojson]
type lsp_capabilities = {
  documentFormattingProvider: bool,
  textDocumentSync: int,
  hoverProvider: bool,
  completionProvider: completion_values,
  definitionProvider: bool,
  typeDefinitionProvider: bool,
  referencesProvider: bool,
  documentSymbolProvider: bool,
  codeActionProvider: bool,
  codeLensProvider: code_values,
  documentHighlightProvider: bool,
  documentRangeFormattingProvider: bool,
  renameProvider: bool,
};

[@deriving yojson]
type position = {
  line: int,
  character: int,
};

[@deriving yojson]
type lens_t = {
  line: int,
  signature: string,
};

[@deriving yojson]
type range_t = {
  start_line: int,
  start_char: int,
  end_line: int,
  end_char: int,
};

[@deriving yojson]
type range = {
  start: position,
  [@key "end"]
  range_end: position,
};

[@deriving yojson]
type capabilities_result = {capabilities: lsp_capabilities};
[@deriving yojson]
type capabilities_response = {
  jsonrpc: string,
  id: int,
  result: capabilities_result,
};

[@deriving yojson]
type command_t = {
  title: string,
  command: string,
};

[@deriving yojson]
type lsp_lens_t = {
  range,
  command: command_t,
};

[@deriving yojson]
type lens_response = {
  jsonrpc: string,
  id: int,
  result: list(lsp_lens_t),
};

[@deriving yojson]
type diagnostic_t = {
  range,
  severity: int,
  message: string,
};

[@deriving yojson]
type document_diagnostics = {
  uri: string,
  diagnostics: list(diagnostic_t),
};

[@deriving yojson]
type diagnostics_message = {
  jsonrpc: string,
  method: string,
  params: document_diagnostics,
};

[@deriving yojson]
type markup_content = {
  kind: string,
  value: string,
};

[@deriving yojson]
type marked_string = {
  language: string,
  value: string,
};

[@deriving yojson]
type hover_result = {
  contents: markup_content,
  range,
};

[@deriving yojson]
type hover_response = {
  jsonrpc: string,
  id: int,
  result: hover_result,
};

[@deriving yojson]
type definition_result = {
  uri: string,
  range,
};

[@deriving yojson]
type definition_response = {
  jsonrpc: string,
  id: int,
  result: definition_result,
};

[@deriving yojson]
type completion_item = {
  label: string,
  kind: int,
  detail: string,
  documentation: string,
};

[@deriving yojson]
type completion_result = {
  isIncomplete: bool,
  items: list(completion_item),
};

[@deriving yojson]
type completion_response = {
  jsonrpc: string,
  id: int,
  result: completion_result,
};

let convert_range = range => {
  let r_start: position = {
    line: range.start_line - 1,
    character: range.start_char,
  };
  let r_end: position = {line: range.end_line - 1, character: range.end_char};
  {start: r_start, range_end: r_end};
};

let read_message = (input): protocol_msg => {
  let clength = input_line(input);
  let cl = "Content-Length: ";
  let cll = String.length(cl);
  if (String.sub(clength, 0, cll) == cl) {
    /* if on windows, dont need the extra -1 */
    let offset = Sys.os_type == "Win32" ? 0 : (-1); /* -1 for trailing \r */

    let num =
      String.sub(clength, cll, String.length(clength) - cll + offset);
    let num = (num |> int_of_string) + (Sys.os_type == "Win32" ? 1 : 2);
    let buffer = Buffer.create(num);
    Buffer.add_channel(buffer, input, num);
    let raw = Buffer.contents(buffer);
    let json = Yojson.Safe.from_string(raw);

    let action =
      Yojson.Safe.Util.member("method", json) |> Yojson.Safe.Util.to_string;

    let idOpt =
      Yojson.Safe.Util.member("id", json) |> Yojson.Safe.Util.to_int_option;

    switch (idOpt) {
    | None => Notification(action, json)
    | Some(id) => Message(id, action, json)
    };
  } else {
    failwith("Invalid header");
  };
};

let send = (output, content) => {
  let length = String.length(content);
  let sep = Sys.os_type == "Unix" ? "\r\n\r\n" : "\n\n";
  let len = string_of_int(length);

  output_string(output, "Content-Length: " ++ len ++ sep ++ content);
  flush(output);
};

let send_null_message = (output, id) => {
  let res =
    `Assoc([
      ("jsonrpc", `String("2.0")),
      ("id", `Int(id)),
      ("result", `Null),
    ]);

  let strJson = Yojson.Safe.pretty_to_string(res);
  send(output, strJson);
};

let send_capabilities = (output, id: int) => {
  let completion_vals: completion_values = {
    resolveProvider: true,
    triggerCharacters: ["."],
  };

  let codeVals: code_values = {resolveProvider: true};

  let capabilities: lsp_capabilities = {
    documentFormattingProvider: false,
    textDocumentSync: 1,
    hoverProvider: true,
    completionProvider: completion_vals,
    definitionProvider: false, // disabled until we can resolve the external module location
    typeDefinitionProvider: false,
    referencesProvider: false,
    documentSymbolProvider: false,
    codeActionProvider: false,
    codeLensProvider: codeVals,
    documentHighlightProvider: false,
    documentRangeFormattingProvider: false,
    renameProvider: false,
  };

  let response: capabilities_response = {
    jsonrpc,
    id,
    result: {
      capabilities: capabilities,
    },
  };

  let res = capabilities_response_to_yojson(response);
  let strJson = Yojson.Safe.to_string(res);

  send(output, strJson);
};

let send_lenses = (~output, ~id: int, lenses: list(lens_t)) => {
  let convertedLenses =
    List.map(
      (l: lens_t) => {
        let rstart: position = {line: l.line - 1, character: 1};
        let rend: position = {line: l.line - 1, character: 1};
        let range = {
          {start: rstart, range_end: rend};
        };

        let command = {title: l.signature, command: "command string"};
        let lsp_lens: lsp_lens_t = {range, command};
        lsp_lens;
      },
      lenses,
    );

  let response: lens_response = {jsonrpc, id, result: convertedLenses};
  let res = lens_response_to_yojson(response);
  let strJson = Yojson.Safe.pretty_to_string(res);
  send(output, strJson);
};

let send_hover = (~output, ~id: int, ~range: range_t, signature) => {
  let range_ext = convert_range(range);
  let hover_info: hover_result = {
    contents: {
      kind: "markdown",
      value: signature,
    },
    range: range_ext,
  };
  let response: hover_response = {jsonrpc, id, result: hover_info};
  let res = hover_response_to_yojson(response);
  let strJson = Yojson.Safe.pretty_to_string(res);
  send(output, strJson);
};

let send_diagnostics =
    (
      ~output,
      ~uri,
      ~warnings: option(list(lsp_warning)),
      error: option(lsp_error),
    ) => {
  let error_diags =
    switch (error) {
    | None => []
    | Some(err) =>
      if (err.line < 0 || err.startchar < 0) {
        // dummy location so set to zero
        let rstart: position = {line: 0, character: 0};
        let rend: position = {line: 0, character: 0};
        let range = {start: rstart, range_end: rend};
        [{range, severity: 1, message: err.lsp_message}];
      } else {
        let rstart: position = {line: err.line - 1, character: err.startchar};
        let rend: position = {line: err.endline - 1, character: err.endchar};
        let range = {start: rstart, range_end: rend};

        [{range, severity: 1, message: err.lsp_message}];
      }
    };

  let with_warnings =
    switch (warnings) {
    | None => error_diags
    | Some(warns) =>
      let warnings_diags =
        List.map(
          (w: lsp_warning) =>
            if (w.line < 0 || w.startchar < 0) {
              // dummy location so set to zero
              let rstart: position = {line: 0, character: 0};
              let rend: position = {line: 0, character: 0};
              let range = {start: rstart, range_end: rend};
              {range, severity: 2, message: w.lsp_message};
            } else {
              let rstart: position = {
                line: w.line - 1,
                character: w.startchar,
              };
              let rend: position = {
                line: w.endline - 1,
                character: w.endchar,
              };
              let range = {start: rstart, range_end: rend};
              {range, severity: 2, message: w.lsp_message};
            },
          warns,
        );
      List.append(error_diags, warnings_diags);
    };

  let message: diagnostics_message = {
    jsonrpc,
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      diagnostics: with_warnings,
    },
  };

  let jsonMessage =
    Yojson.Safe.to_string(diagnostics_message_to_yojson(message));

  send(output, jsonMessage);
};

let clear_diagnostics = (~output, uri) => {
  let message: diagnostics_message = {
    jsonrpc,
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      diagnostics: [],
    },
  };

  let jsonMessage =
    Yojson.Safe.to_string(diagnostics_message_to_yojson(message));

  send(output, jsonMessage);
};

let send_completion = (~output, ~id: int, completions: list(completion_item)) => {
  let completion_info: completion_result = {
    isIncomplete: false,
    items: completions,
  };
  let response: completion_response = {jsonrpc, id, result: completion_info};

  let res = completion_response_to_yojson(response);
  let strJson = Yojson.Safe.pretty_to_string(res);

  send(output, strJson);
};