import { TextureView } from "./TextureView";
import { with_disposer } from "../../../test/src/core/observables/disposable_helpers";
import { TextureController } from "../controllers/TextureController";
import { TextureRenderer } from "../rendering/TextureRenderer";
import { StubThreeRenderer } from "../../../test/src/core/rendering/StubThreeRenderer";

test("Renders correctly without textures.", () =>
    with_disposer(disposer => {
        const ctrl = disposer.add(new TextureController());
        const view = disposer.add(
            new TextureView(ctrl, new TextureRenderer(ctrl, new StubThreeRenderer())),
        );

        expect(view.element).toMatchSnapshot("Should render a toolbar and a renderer widget.");
    }));
