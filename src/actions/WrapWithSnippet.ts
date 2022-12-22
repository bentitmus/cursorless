import { callFunctionAndUpdateSelections } from "../core/updateSelections/updateSelections";
import ide from "../libs/cursorless-engine/singletons/ide.singleton";
import { ModifyIfUntypedStage } from "../processTargets/modifiers/ConditionalModifierStages";
import { Target } from "../typings/target.types";
import { Graph } from "../typings/Types";
import {
  findMatchingSnippetDefinitionStrict,
  transformSnippetVariables,
} from "../util/snippet";
import { ensureSingleEditor } from "../util/targetUtils";
import { SnippetParser } from "../vendor/snippet/snippetParser";
import { Action, ActionReturnValue } from "./actions.types";

export default class WrapWithSnippet implements Action {
  private snippetParser = new SnippetParser();

  getFinalStages(snippetLocation: string) {
    const [snippetName, placeholderName] =
      parseSnippetLocation(snippetLocation);

    const snippet = this.graph.snippets.getSnippetStrict(snippetName);

    const variables = snippet.variables ?? {};
    const defaultScopeType = variables[placeholderName]?.wrapperScopeType;

    if (defaultScopeType == null) {
      return [];
    }

    return [
      new ModifyIfUntypedStage({
        type: "modifyIfUntyped",
        modifier: {
          type: "containingScope",
          scopeType: {
            type: defaultScopeType,
          },
        },
      }),
    ];
  }

  constructor(private graph: Graph) {
    this.run = this.run.bind(this);
  }

  async run(
    [targets]: [Target[]],
    snippetLocation: string,
  ): Promise<ActionReturnValue> {
    const [snippetName, placeholderName] =
      parseSnippetLocation(snippetLocation);

    const snippet = this.graph.snippets.getSnippetStrict(snippetName);

    const editor = ide().getEditableTextEditor(ensureSingleEditor(targets));

    const definition = findMatchingSnippetDefinitionStrict(
      targets,
      snippet.definitions,
    );

    const parsedSnippet = this.snippetParser.parse(definition.body.join("\n"));

    transformSnippetVariables(parsedSnippet, placeholderName);

    const snippetString = parsedSnippet.toTextmateString();

    await this.graph.editStyles.displayPendingEditDecorations(
      targets,
      this.graph.editStyles.pendingModification0,
    );

    const targetSelections = targets.map((target) => target.contentSelection);

    // NB: We used the command "editor.action.insertSnippet" instead of calling editor.insertSnippet
    // because the latter doesn't support special variables like CLIPBOARD
    const [updatedTargetSelections] = await callFunctionAndUpdateSelections(
      this.graph.rangeUpdater,
      () => editor.insertSnippet(snippetString, targetSelections),
      editor.document,
      [targetSelections],
    );

    return {
      thatSelections: updatedTargetSelections.map((selection) => ({
        editor,
        selection,
      })),
    };
  }
}

function parseSnippetLocation(snippetLocation: string): [string, string] {
  const [snippetName, placeholderName] = snippetLocation.split(".");
  if (snippetName == null || placeholderName == null) {
    throw new Error("Snippet location missing '.'");
  }
  return [snippetName, placeholderName];
}
