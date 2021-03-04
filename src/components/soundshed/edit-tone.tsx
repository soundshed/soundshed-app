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
  const tone = ToneEditStore.useState((s) => s.editTone);

  const saveFailed = false;
  const tagifySettings = { callbacks: null };

  const tagifyRef = {};

  const [updatedArtistTags, setUpdatedArtistsTags] = React.useState(null);
  const [updatedCategoryTags, setUpdatedCategoryTags] = React.useState(null);

  const handleSubmit = (event) => {
    event.preventDefault();

    //apply edits
    if (updatedArtistTags != null && updatedArtistTags.filter(t=>t!=null)!=[]) {
      ToneEditStore.update((s) => {
        s.editTone.artists = updatedArtistTags.filter(t=>t!=null);
      });
    }

    if (updatedCategoryTags != null && updatedCategoryTags.filter(t=>t!=null)!=[]) {
      ToneEditStore.update((s) => {
        s.editTone.categories = updatedCategoryTags.filter(t=>t!=null);
      });
    }

    // save tone. hack to ensure state updated before save
    setTimeout(() => {
      appViewModel.storeFavourite(ToneEditStore.getRawState().editTone);
      
    }, 500);

    ToneEditStore.update((s) => {
      s.isToneEditorOpen = false;
      s.tone=s.editTone;
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
    /*tagifySettings.callbacks = {
      add: onTagifyAdd,
      remove: onTagifyRemove,
      input: onTagifyInput,
      invalid: onTagifyInvalid,
    };*/
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
                      s.editTone.name = event.target.value;
                    });
                  }}
                />
              </Form.Group>

              <Form.Group controlId="formEditTone">
                <Form.Label>Description</Form.Label>
                <Form.Control as="textarea" rows={2}  placeholder="Enter an optional description for this tone"
                  value={tone.description}
                  onChange={(event) => {
                    ToneEditStore.update((s) => {
                      s.editTone.description = event.target.value;
                    });
                  }}/>
                
              </Form.Group>

              <Form.Group controlId="formArtists">
                <Form.Label>Artists</Form.Label>
                <Tags
                  value={tone.artists}
                  onChange={(e) => {
                    e.persist();
                    if (e.target.value?.length > 0) {
                      let list = JSON.parse(e.target.value).filter(t=>t!=null).map((t) => t.value);

                      setUpdatedArtistsTags(list);
                    } else {
                      setUpdatedArtistsTags([]);
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
                    if (e.target.value?.length > 0) {
                      let list = JSON.parse(e.target.value).filter(t=>t!=null).map((t) => t.value);
                      setUpdatedCategoryTags(list);
                    }else {
                      setUpdatedCategoryTags([]);
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
