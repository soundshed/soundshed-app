import * as React from "react";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import { AppStateStore, ToneEditStore } from "../../core/appViewModel";
import Tags from "@yaireo/tagify/dist/react.tagify"; // React-wrapper file
import "@yaireo/tagify/dist/tagify.css"; // Tagify CSS
import { Tone } from "../../core/soundshedApi";
import { appViewModel } from "../app";

const EditToneControl = () => {
  const openToneEdit: boolean = ToneEditStore.useState(
    (s) => s.isToneEditorOpen
  );
  const tone = ToneEditStore.useState((s) => s.tone);

  const saveFailed = false;
  const tagifySettings = { callbacks: null };

  const tagifyRef = {};

  const handleSubmit = (event) => {
    event.preventDefault();

    // save tone.

    appViewModel.storeFavourite(tone);

    ToneEditStore.update((s) => {
      s.isToneEditorOpen = false;
    });
  };

  const handleCancel = () => {
    ToneEditStore.update((s) => {
      s.isToneEditorOpen = false;
    });
  };

  const handleDelete = () => {
    appViewModel.deleteFavourite(tone);
    ToneEditStore.update((s) => {
      s.isToneEditorOpen = false;
    });
  };

  React.useEffect(() => {
    tagifySettings.callbacks = {
      add: onTagifyAdd,
      remove: onTagifyRemove,
      input: onTagifyInput,
      invalid: onTagifyInvalid,
    };
  }, []);

  // callbacks for all of Tagify's events:
  const onTagifyAdd = (e) => {
    console.log("added:", e.detail);
  };

  const onTagifyRemove = (e) => {
    console.log("remove:", e.detail);
  };

  const onTagifyInput = (e) => {
    console.log("input:", e.detail);
  };

  const onTagifyInvalid = (e) => {
    console.log("invalid:", e.detail);
  };

  if (!openToneEdit) return <div></div>;
  else
    return (
      <Modal show={openToneEdit} onHide={() => {}}>
        <Modal.Body>
          <div>
            <p>Edit Tone</p>

            <Form onSubmit={handleSubmit}>
              <Form.Group controlId="formEditTone">
                <Form.Label>Title</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter a title for this tone"
                  value={tone.name}
                  onChange={(event) => {
                    ToneEditStore.update((s) => {
                      s.tone.name = event.target.value;
                    });
                  }}
                />
              </Form.Group>

              <Form.Group controlId="formEditTone">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter an optional description for this tone"
                  value={tone.description}
                  onChange={(event) => {
                    ToneEditStore.update((s) => {
                      s.tone.description = event.target.value;
                    });
                  }}
                />
              </Form.Group>

              <Form.Group controlId="formArtists">
                <Form.Label>Artists</Form.Label>
                <Tags
                  value={tone.artists}
                  onChange={(e) => {
                    e.persist();
                    if (e.target.value.length > 0) {
                      let list = JSON.parse(e.target.value).map((t) => t.value);
                      ToneEditStore.update((s) => {
                        s.tone.artists = list;
                      });
                    }
                  }}
                />
              </Form.Group>

              <Form.Group controlId="formCategories">
                <Form.Label>Categories</Form.Label>
                <Tags
                  value={tone.categories}
                  onChange={(e) => {
                    e.persist();
                    if (e.target.value.length > 0) {
                      let list = JSON.parse(e.target.value).map((t) => t.value);
                      ToneEditStore.update((s) => {
                        s.tone.categories = list;
                      });
                    }
                  }}
                />
              </Form.Group>
              {saveFailed ? (
                <Alert variant="danger">Failed to save update.</Alert>
              ) : (
                ""
              )}
              <Button variant="secondary" type="button" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                className="ms-4"
                onClick={handleDelete}
              >
                Delete
              </Button>

              <Button variant="primary" type="submit" className="float-end">
                Save
              </Button>
            </Form>
          </div>
        </Modal.Body>
      </Modal>
    );
};
export default EditToneControl;
